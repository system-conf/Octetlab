import { Ipv4 } from '../../../net/Ipv4'
import {
  type DeviceContext,
  type IcmpErrorReport,
  type RemoteClientSession,
  type RemoteConnectOutcome,
  type ServiceSession,
  SIM_PORTS,
  type SimRemoteConnectRequest,
  type TcpSegment,
  type TransportDelivery,
} from '../../contract'
import { ServiceNotes } from '../ServiceNotes'
import { ServiceRuntimes } from '../ServiceRuntimes'
import { ServiceSender } from '../ServiceSender'
import { ServiceWire } from '../ServiceWire'
import { VtyAccess } from './VtyAccess'

/** Lab value: an attempt without an answer gives up after this long (IOS waits about 30 s; UNVERIFIED). */
export const REMOTE_TIMEOUT_MS = 5000
/** Size of the client's opaque login data (user name and password are never put on the wire as text). */
const LOGIN_BYTES = 32

const AUTH_FAILED: RemoteConnectOutcome = { ok: false, failure: 'authFailed', reason: 'remoteLoginFailed' }
const PASSWORD_NOT_SET: RemoteConnectOutcome = { ok: false, failure: 'passwordNotSet', reason: 'remoteLoginFailed' }

/**
 * `ssh -l <user> <ip>` / `telnet <ip>` from a host or router (pack 5.2, scope A, docs/SECURITY_PACK.md §2):
 * SYN → SYN-ACK → ACK + login data → the server's greeting → ACK + FIN, and the result. RST = refused
 * (no listener, or the vty `access-class`), ICMP errors end the attempt, REMOTE_TIMEOUT_MS = timed out.
 * The login verdict is worked out from the target's vty settings when the request starts (VtyAccess),
 * so the session keeps no password.
 */
export class RemoteClient {
  static listens(ctx: DeviceContext, port: number): boolean {
    return ServiceRuntimes.sessions(ctx).some((session) => session.kind === 'remoteClient' && session.srcPort === port)
  }

  static start(ctx: DeviceContext, requestId: string, request: SimRemoteConnectRequest): void {
    const { protocol, targetIp } = request
    if (!Ipv4.isValid(targetIp)) {
      ctx.openEvent({ flowId: requestId, protocol }).conclude('dropped', 7, 'invalidConfig')
      return RemoteClient.report(ctx, requestId, request, { ok: false, failure: 'localFailure', reason: 'invalidConfig' })
    }
    const target = VtyAccess.deviceAt(ctx.network, targetIp)
    const credentials = {
      ...(request.username === undefined ? {} : { username: request.username }),
      ...(request.password === undefined ? {} : { password: request.password }),
    }
    const isn = ServiceRuntimes.randomId(ctx, 32)
    const session: RemoteClientSession = {
      kind: 'remoteClient',
      requestId,
      protocol,
      targetIp,
      srcPort: ServiceRuntimes.allocatePort(ctx),
      state: 'synSent',
      seq: isn,
      verdict: target === undefined ? AUTH_FAILED : VtyAccess.authenticate(target, protocol, credentials),
    }
    ServiceRuntimes.addSession(ctx, session)
    const syn = ServiceWire.tcp(session.srcPort, SIM_PORTS[protocol], ['syn'], isn, null)
    const sent = ServiceSender.send(ctx, {
      ids: ctx.newPdu(requestId),
      dst: targetIp,
      payload: syn,
      notes: [ServiceNotes.message('tcpHandshake', { flags: ServiceWire.flagText(syn) })],
    })
    if (!sent.ok) return RemoteClient.finish(ctx, session, { ok: false, failure: 'localFailure', reason: sent.reason })
    ctx.schedule(REMOTE_TIMEOUT_MS, { layer: 'services', kind: 'remoteTimeout', requestId })
  }

  /** A segment for one of our connections (false = not ours). */
  static onSegment(ctx: DeviceContext, delivery: TransportDelivery, segment: TcpSegment): boolean {
    const session = RemoteClient.sessionBy(ctx, (candidate) => candidate.srcPort === segment.dstPort && candidate.targetIp === delivery.packet.src)
    if (!session) return false
    const { event } = delivery
    const flags = new Set(segment.flags)
    const serverSeq = segment.seq ?? 0
    if (flags.has('rst')) {
      ServiceNotes.add(event, 'in', 'tcpConnectionRefused', undefined, 4)
      event.conclude('delivered', 4)
      RemoteClient.finish(ctx, session, { ok: false, failure: 'refused', reason: 'connectionRefused' })
      return true
    }
    if (session.state === 'synSent' && flags.has('syn') && flags.has('ack') && segment.ack === ServiceWire.seqAdd(session.seq, 1)) {
      ServiceNotes.add(event, 'in', 'tcpHandshake', { flags: ServiceWire.flagText(segment) }, 4)
      event.conclude('replied', 7)
      const seq = ServiceWire.seqAdd(session.seq, 1)
      const ack = ServiceWire.seqAdd(serverSeq, 1)
      RemoteClient.store(ctx, { ...session, state: 'loginSent', seq, ack })
      const login = ServiceWire.tcp(session.srcPort, SIM_PORTS[session.protocol], ['ack', 'psh'], seq, ack)
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.requestId),
        dst: session.targetIp,
        payload: { ...login, payload: { kind: 'data', bytes: LOGIN_BYTES } },
        causeEventId: event.id,
      })
      return true
    }
    const greeting = segment.payload
    if (session.state === 'loginSent' && greeting?.kind === 'data') {
      // The server closing right after its greeting is "Password required, but none set".
      const outcome = flags.has('fin') ? PASSWORD_NOT_SET : session.verdict
      event.conclude('replied', 7)
      const seq = ServiceWire.seqAdd(session.seq, LOGIN_BYTES)
      const ack = ServiceWire.seqAdd(serverSeq, greeting.bytes + (flags.has('fin') ? 1 : 0))
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.requestId),
        dst: session.targetIp,
        payload: ServiceWire.tcp(session.srcPort, SIM_PORTS[session.protocol], ['ack', 'fin'], seq, ack),
        causeEventId: event.id,
        notes: [ServiceNotes.message('tcpClose')],
      })
      RemoteClient.finish(ctx, session, outcome)
      return true
    }
    return false
  }

  /** ICMP error about our connection: the attempt ends (false = not ours). */
  static onIcmpError(ctx: DeviceContext, report: IcmpErrorReport, srcPort: number, dst: string): boolean {
    const session = RemoteClient.sessionBy(ctx, (candidate) => candidate.srcPort === srcPort && candidate.targetIp === dst)
    if (!session) return false
    if (report.local) report.event.conclude('dropped', 7, 'arpTimeout')
    else report.event.conclude('delivered', 7)
    RemoteClient.finish(ctx, session, RemoteClient.icmpOutcome(report))
    return true
  }

  static onTimeout(ctx: DeviceContext, requestId: string): void {
    const session = RemoteClient.sessionBy(ctx, (candidate) => candidate.requestId === requestId)
    if (!session) return
    ctx.openEvent({ flowId: requestId, protocol: session.protocol }).conclude('timedOut', 7, 'requestTimedOut')
    RemoteClient.finish(ctx, session, { ok: false, failure: 'timedOut', reason: 'requestTimedOut' })
  }

  private static icmpOutcome(report: IcmpErrorReport): RemoteConnectOutcome {
    if (report.local) return { ok: false, failure: 'timedOut', reason: 'arpTimeout' }
    const { error } = report
    if (error.type === 'timeExceeded') return { ok: false, failure: 'unreachable', reason: 'ttlExpired' }
    if (error.code === 'port') return { ok: false, failure: 'refused', reason: 'connectionRefused' }
    if (error.code === 'adminProhibited') return { ok: false, failure: 'adminProhibited', reason: 'aclDenied' }
    return { ok: false, failure: 'unreachable', reason: 'noRoute' }
  }

  private static finish(ctx: DeviceContext, session: RemoteClientSession, outcome: RemoteConnectOutcome): void {
    RemoteClient.store(ctx, null, session.requestId)
    ctx.report(session.requestId, { kind: 'remoteConnect', protocol: session.protocol, targetIp: session.targetIp, outcome }, true)
  }

  private static report(ctx: DeviceContext, requestId: string, request: SimRemoteConnectRequest, outcome: RemoteConnectOutcome): void {
    ctx.report(requestId, { kind: 'remoteConnect', protocol: request.protocol, targetIp: request.targetIp, outcome }, true)
  }

  private static sessionBy(ctx: DeviceContext, matches: (session: RemoteClientSession) => boolean): RemoteClientSession | undefined {
    return ServiceRuntimes.sessions(ctx).find((session): session is RemoteClientSession => session.kind === 'remoteClient' && matches(session))
  }

  private static store(ctx: DeviceContext, session: RemoteClientSession | null, requestId = session?.requestId): void {
    const matches = (candidate: ServiceSession) => candidate.kind === 'remoteClient' && candidate.requestId === requestId
    ServiceRuntimes.replaceSession(ctx, matches, session)
  }
}
