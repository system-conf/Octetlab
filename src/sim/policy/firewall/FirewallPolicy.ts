// First link of the security chain (docs/FIREWALL_PACK.md §5.1): the stateful firewall on a device whose
// kind is 'firewall'. Every other device gets `pass` with the same packet object (PacketPolicy contract).
// - Ingress (before ACL and NAT) only checks the arrival interface's nameif (step 1): packets for the
//   firewall itself stop there (steps 1 and 2 only), transit packets are decided on egress.
// - Egress runs last (NAT → ACL → firewall), when both interfaces are known: nameif of the exit (step 1),
//   the connection lookup on real addresses (step 2, ICMP errors by the flow they quote), then the level
//   rules with the bound access lists (steps 3–6, FirewallRules.verdict) and, for an allowed opener, a new
//   connection (step 7). AclPolicy steps aside on a firewall, so interface ACLs see real addresses and
//   never block the replies of a tracked connection, as on stateful appliances; matches still count in
//   `aclCounters` and leave `acl:notes`.
// Drops are silent (no ICMP error), as firewalls drop; each one counts in `firewallStatistics.denied`.
import type { Device } from '../../../domain'
import type { DeviceContext, EventBuilder, Ipv4Packet } from '../../contract'
import { FrameEncoder } from '../../pcap/FrameEncoder'
import { AclPacketViews } from '../acl/AclPacketViews'
import { AclRuntime } from '../acl/AclRuntime'
import { NatPackets } from '../nat/NatPackets'
import { type EgressPacket, type IngressPacket, PASS, type PacketPolicy, type PolicyVerdict } from '../PacketPolicy'
import { type ConnectionMatch, ConnectionTable } from './ConnectionTable'
import { FirewallConfig, type FirewallInterface, type FirewallTimeoutsMs } from './FirewallConfig'
import { type FirewallFlow, FirewallFlows } from './FirewallFlows'
import { FirewallNatView } from './FirewallNatView'
import { FirewallNotes } from './FirewallNotes'
import { type FirewallAclCheck, type FirewallDropReason, FirewallRules, type FirewallTcpKind, type FirewallVerdict } from './FirewallRules'
import { FirewallRuntime, type FirewallState } from './FirewallRuntime'

const LAYER = 3

function deviceOf(ctx: DeviceContext): Device | undefined {
  // The prelude chain test passes a context without runtime; a missing device is no firewall.
  const device: Device | undefined = ctx.device
  return device
}

function tcpKindOf(flow: FirewallFlow | null): FirewallTcpKind {
  if (flow === null || flow.protocol !== 'tcp') return 'notTcp'
  return FirewallFlows.isTcpOpener(flow.tcpFlags) ? 'opener' : 'midStream'
}

/** The packet with its real source (NAT translated it on this egress already) for the ACL checks. */
function realPacket(packet: Ipv4Packet, flow: FirewallFlow | null): Ipv4Packet {
  if (flow === null || (flow.src.ip === packet.src && FirewallFlows.of(packet)?.src.port === flow.src.port)) return packet
  return NatPackets.withSource(packet, flow.src)
}

/** Counts and notes one evaluated access list, like AclPolicy does on routers. */
function noteAcl(ctx: DeviceContext, event: EventBuilder, check: FirewallAclCheck): void {
  const params = { acl: check.acl, direction: check.direction, iface: check.interfaceId }
  const direction = check.direction === 'in' ? 'in' : 'out'
  switch (check.decision.kind) {
    case 'noList':
      return event.note(LAYER, direction, FirewallNotes.acl('noEntries', params))
    case 'implicitDeny':
      return event.note(LAYER, direction, FirewallNotes.acl('implicitDeny', params))
    case 'match':
      AclRuntime.count(ctx, check.acl, check.decision.seq)
      return event.note(LAYER, direction, FirewallNotes.acl(check.permitted ? 'permitted' : 'denied', { ...params, seq: check.decision.seq }))
  }
}

/** The inspector note for a level verdict; null when an access list decided (its own note says why). */
function verdictNote(verdict: FirewallVerdict, ingress: FirewallInterface, exit: FirewallInterface, flow: FirewallFlow | null) {
  const pair = FirewallNotes.pair(ingress, exit)
  if (verdict.kind === 'allow') {
    switch (verdict.rule) {
      case 'higherToLower':
        return FirewallNotes.of('higherToLower', pair)
      case 'sameLevelPermitted':
        return FirewallNotes.of('sameLevelPermitted', pair)
      case 'aclException':
        return FirewallNotes.of('aclException', { ...pair, acl: ingress.accessGroups?.in ?? '' })
    }
  }
  switch (verdict.reason) {
    case 'firewallSameLevel':
      return FirewallNotes.of('sameLevel', pair)
    case 'firewallDenied':
      return FirewallNotes.of('lowerToHigher', pair)
    case 'firewallNoConnection':
      return FirewallNotes.of('noConnection', { flags: (flow?.tcpFlags ?? []).join(',').toUpperCase() })
    case 'aclDenied':
      return null
  }
}

export class FirewallPolicy implements PacketPolicy {
  ingress(ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    const device = deviceOf(ctx)
    if (!FirewallConfig.isFirewall(device) || FirewallConfig.interfaceOf(device, arrival.interfaceId) !== null) return PASS(arrival.packet)
    arrival.event.note(LAYER, 'in', FirewallNotes.of('noNameif', { iface: arrival.interfaceId }))
    return FirewallPolicy.drop(ctx, 'firewallNoNameif')
  }

  egress(ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    const device = deviceOf(ctx)
    if (!FirewallConfig.isFirewall(device)) return PASS(departure.packet)
    const { ingressInterfaceId, exitInterfaceId, packet, event } = departure
    const ingress = FirewallConfig.interfaceOf(device, ingressInterfaceId)
    const exit = FirewallConfig.interfaceOf(device, exitInterfaceId)
    if (ingress === null || exit === null) {
      event.note(LAYER, 'out', FirewallNotes.of('noNameif', { iface: ingress === null ? ingressInterfaceId : exitInterfaceId }))
      return FirewallPolicy.drop(ctx, 'firewallNoNameif')
    }
    const settings = FirewallConfig.settingsOf(device)
    const inspectIcmp = FirewallConfig.inspectsIcmp(settings)
    const timeouts = FirewallConfig.timeoutsOf(settings)
    const state = FirewallRuntime.read(ctx)
    const bytes = FrameEncoder.ipv4Length(packet)

    const quoted = FirewallFlows.quotedOf(packet)
    const quotedMatch = quoted === null ? undefined : ConnectionTable.findQuoted(state.connections, quoted)
    if (quotedMatch !== undefined) {
      event.note(LAYER, 'out', FirewallNotes.of('errorMatched', FirewallNotes.connection(quotedMatch.connection)))
      return PASS(packet)
    }
    const seen = FirewallFlows.of(packet)
    const flow = seen === null ? null : FirewallNatView.real(ctx, device, ingressInterfaceId, exitInterfaceId, seen)
    const match = flow === null ? undefined : ConnectionTable.find(state.connections, flow, inspectIcmp)
    if (flow !== null && match !== undefined) {
      FirewallPolicy.continued(ctx, state, match, flow, { bytes, timeouts, event })
      return PASS(packet)
    }

    const { verdict, acls } = FirewallRules.verdict(device, ingress, exit, AclPacketViews.of(realPacket(packet, flow)), tcpKindOf(flow))
    for (const check of acls) noteAcl(ctx, event, check)
    const note = verdictNote(verdict, ingress, exit, flow)
    if (note !== null) event.note(LAYER, 'out', note)
    if (verdict.kind === 'drop') return FirewallPolicy.drop(ctx, verdict.reason)
    if (flow !== null && FirewallFlows.opens(flow, inspectIcmp)) FirewallPolicy.open(ctx, state, flow, { ingress, exit, bytes, timeouts, event })
    return PASS(packet)
  }

  /** Step 2: the packet belongs to `match`; the entry advances (state, idle timer, bytes) or goes on RST. */
  private static continued(
    ctx: DeviceContext,
    state: FirewallState,
    match: ConnectionMatch,
    flow: FirewallFlow,
    seen: { readonly bytes: number; readonly timeouts: FirewallTimeoutsMs; readonly event: EventBuilder },
  ): void {
    const { connection } = match
    const params = FirewallNotes.connection(connection)
    seen.event.note(LAYER, 'out', FirewallNotes.of('connectionMatched', params))
    const next = ConnectionTable.advance(match, flow, ctx.now, seen.bytes, seen.timeouts)
    FirewallRuntime.write(ctx, { ...state, connections: ConnectionTable.replace(state.connections, connection.id, next) })
    if (next === null) seen.event.note(LAYER, 'out', FirewallNotes.of('connectionReset', params))
    else if (next.state !== connection.state && next.state === 'established') seen.event.note(LAYER, 'out', FirewallNotes.of('connectionEstablished', params))
    else if (next.state !== connection.state && next.state === 'halfClosed') seen.event.note(LAYER, 'out', FirewallNotes.of('connectionHalfClosed', params))
  }

  /** Step 7: an allowed opener creates its connection, stored with the real addresses. */
  private static open(
    ctx: DeviceContext,
    state: FirewallState,
    flow: FirewallFlow,
    seen: { readonly ingress: FirewallInterface; readonly exit: FirewallInterface; readonly bytes: number; readonly timeouts: FirewallTimeoutsMs; readonly event: EventBuilder },
  ): void {
    // `created` never resets, so it numbers the entries uniquely (also across `clear conn`).
    const id = state.statistics.created + 1
    const origin = { id, inInterface: seen.ingress.nameif, outInterface: seen.exit.nameif, now: ctx.now, bytes: seen.bytes }
    const created = ConnectionTable.create(flow, origin, seen.timeouts)
    FirewallRuntime.write(ctx, { connections: [...state.connections, created], statistics: { ...state.statistics, created: id } })
    seen.event.note(LAYER, 'out', FirewallNotes.of('connectionCreated', { ...FirewallNotes.connection(created), from: seen.ingress.nameif, to: seen.exit.nameif }))
  }

  private static drop(ctx: DeviceContext, reason: FirewallDropReason): PolicyVerdict {
    FirewallRuntime.countDenied(ctx)
    return { kind: 'drop', reason }
  }
}

