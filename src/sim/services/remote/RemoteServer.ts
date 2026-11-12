import { localizedMessage } from '../../../i18n/messageKeys'
import { type DeviceContext, SIM_PORTS, type TcpSegment, type TransportDelivery } from '../../contract'
import { ServiceNotes } from '../ServiceNotes'
import { ServiceRuntimes } from '../ServiceRuntimes'
import { ServiceSender } from '../ServiceSender'
import { ServiceWire } from '../ServiceWire'
import { VtyAccess } from './VtyAccess'

/** Bytes of the greetings the vty sends (the texts IOS prints; the payload itself is opaque). */
const LOGIN_PROMPT_BYTES = '\r\n\r\nUser Access Verification\r\n\r\nPassword: '.length
const PASSWORD_NOT_SET_BYTES = 'Password required, but none set\r\n'.length

/**
 * The SSH / Telnet server of a device's vty lines (pack 5.2, docs/SECURITY_PACK.md §9), stateless like
 * WebServer: a protocol the device does not accept is never listened on (the network layer answers RST),
 * the vty `access-class` resets the connection, otherwise SYN-ACK, then a greeting after the client's
 * login data ("Password required, but none set" closes at once). The login verdict is the client's
 * (RemoteClient), from the same VtyAccess rules.
 */
export class RemoteServer {
  static listens(ctx: DeviceContext, dstPort: number): boolean {
    const protocol = RemoteServer.protocolOf(dstPort)
    return protocol !== null && VtyAccess.accepts(ctx.device, protocol)
  }

  /** A segment to port 22 / 23 (false = not a remote-access port). */
  static onSegment(ctx: DeviceContext, delivery: TransportDelivery, segment: TcpSegment): boolean {
    if (RemoteServer.protocolOf(segment.dstPort) === null) return false
    const { event, packet } = delivery
    const flags = new Set(segment.flags)
    const seq = segment.seq ?? 0
    if (flags.has('rst')) {
      event.conclude('delivered', 4)
      return true
    }
    if (flags.has('syn')) {
      if (!VtyAccess.accessClassPermits(ctx.device, packet.src, packet.dst, segment.dstPort)) {
        event.note(7, 'in', localizedMessage('simulation:reasons.vtyAccessDenied'))
        event.conclude('replied', 4)
        const rst = ServiceWire.tcp(segment.dstPort, segment.srcPort, ['ack', 'rst'], 0, ServiceWire.seqAdd(seq, 1))
        ServiceSender.reply(ctx, delivery, rst, [ServiceNotes.message('tcpConnectionRefused')])
        return true
      }
      ServiceNotes.add(event, 'in', 'tcpHandshake', { flags: ServiceWire.flagText(segment) }, 4)
      event.conclude('replied', 4)
      const synAck = ServiceWire.tcp(segment.dstPort, segment.srcPort, ['syn', 'ack'], ServiceRuntimes.randomId(ctx, 32), ServiceWire.seqAdd(seq, 1))
      ServiceSender.reply(ctx, delivery, synAck, [ServiceNotes.message('tcpHandshake', { flags: ServiceWire.flagText(synAck) })])
      return true
    }
    const login = segment.payload
    if (login?.kind === 'data') {
      const refuse = VtyAccess.loginMode(ctx.device) === 'passwordNotSet'
      if (refuse) event.note(7, 'in', localizedMessage('simulation:reasons.remoteLoginFailed'))
      event.conclude('replied', 7)
      const greeting = { kind: 'data', bytes: refuse ? PASSWORD_NOT_SET_BYTES : LOGIN_PROMPT_BYTES } as const
      const flagsOut = refuse ? (['ack', 'fin', 'psh'] as const) : (['ack', 'psh'] as const)
      const reply = ServiceWire.tcp(segment.dstPort, segment.srcPort, flagsOut, segment.ack ?? 0, ServiceWire.seqAdd(seq, login.bytes))
      ServiceSender.reply(ctx, delivery, { ...reply, payload: greeting }, refuse ? [ServiceNotes.message('tcpClose')] : [])
      return true
    }
    if (flags.has('fin')) ServiceNotes.add(event, 'in', 'tcpClose', undefined, 4)
    event.conclude('delivered', 4)
    return true
  }

  static protocolOf(port: number): 'ssh' | 'telnet' | null {
    if (port === SIM_PORTS.ssh) return 'ssh'
    if (port === SIM_PORTS.telnet) return 'telnet'
    return null
  }
}
