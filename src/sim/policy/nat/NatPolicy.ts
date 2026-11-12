// NAT policy of the packet-policy chain (pack 5.2, owner: agent B; docs/SECURITY_PACK.md §8): inside
// source translation. Egress (after routing, inside → outside interface) rewrites the source and creates
// dynamic entries; ingress on an outside interface (before the "for me?" check) rewrites the destination
// back, so PAT replies to the router's WAN address reach the inside host. Decision 1: the cloud answers
// private sources too, so NAT changes headers and tables, never reachability.
import type { Device, NatSettings } from '../../../domain'
import type { DeviceContext, EventBuilder, Ipv4Packet } from '../../contract'
import type { NatEndpoint, NatTranslation } from '../../contract/SecurityRuntime'
import { type EgressPacket, type IngressPacket, PASS, type PacketPolicy, type PolicyVerdict } from '../PacketPolicy'
import { NatAllocator } from './NatAllocator'
import { NatConfig } from './NatConfig'
import { NatNotes } from './NatNotes'
import { type NatFlow, NatPackets } from './NatPackets'
import { NatRuntime, type NatState } from './NatRuntime'
import { NatTable } from './NatTable'
import { NAT_TIMEOUTS, NatTimeouts } from './NatTimeouts'

/** The rows NAT works with at `ctx.now`: static rows from the configuration, then the live dynamic ones. */
interface Working {
  readonly device: Device
  readonly nat: NatSettings
  readonly state: NatState
  readonly rows: readonly NatTranslation[]
}

function working(ctx: DeviceContext, device: Device, nat: NatSettings): Working {
  const state = NatRuntime.read(ctx)
  return { device, nat, state, rows: [...NatConfig.staticRows(nat), ...state.translations] }
}

/** A simple row translates the address only; extended rows translate the port too. */
function mapped(entry: NatTranslation, side: 'local' | 'global', port: number | undefined): NatEndpoint {
  const endpoint = side === 'local' ? entry.insideLocal : entry.insideGlobal
  if (entry.protocol === 'any') return port === undefined ? { ip: endpoint.ip } : { ip: endpoint.ip, port }
  return endpoint
}

/** Stores `entry` refreshed (dynamic rows only) and one more hit. */
function touch(ctx: DeviceContext, work: Working, entry: NatTranslation, closing: boolean): void {
  const { state } = work
  const statistics = { ...state.statistics, hits: state.statistics.hits + 1 }
  if (entry.origin === 'static') return NatRuntime.write(ctx, { ...state, statistics })
  const idle = closing && entry.protocol === 'tcp' ? NAT_TIMEOUTS.finRst : NatTimeouts.of(entry.protocol)
  const refreshed: NatTranslation = { ...entry, lastUsedAt: ctx.now, expiresAt: ctx.now + idle }
  const translations = state.translations.map((candidate) => (NatTable.same(candidate, entry) ? refreshed : candidate))
  NatRuntime.write(ctx, { translations, statistics })
}

function miss(ctx: DeviceContext, work: Working, created?: NatTranslation): void {
  const { state } = work
  const translations = created === undefined ? state.translations : [...state.translations, created]
  NatRuntime.write(ctx, { translations, statistics: { ...state.statistics, misses: state.statistics.misses + 1 } })
}

function deviceOf(ctx: DeviceContext): Device | undefined {
  // The prelude chain test passes an empty context: a missing device has no NAT.
  const device: Device | undefined = ctx.device
  return device
}

export class NatPolicy implements PacketPolicy {
  ingress(ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    const device = deviceOf(ctx)
    const nat = NatConfig.of(device)
    if (device === undefined || nat === undefined || arrival.linkBroadcast) return PASS(arrival.packet)
    if (NatConfig.roleOf(device, arrival.interfaceId) !== 'outside') return PASS(arrival.packet)
    return NatPolicy.inbound(ctx, working(ctx, device, nat), arrival.packet, arrival.event)
  }

  egress(ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    const device = deviceOf(ctx)
    const nat = NatConfig.of(device)
    if (device === undefined || nat === undefined) return PASS(departure.packet)
    if (NatConfig.roleOf(device, departure.ingressInterfaceId) !== 'inside' || NatConfig.roleOf(device, departure.exitInterfaceId) !== 'outside') {
      return PASS(departure.packet)
    }
    return NatPolicy.outbound(ctx, working(ctx, device, nat), departure.packet, departure.event)
  }

  private static inbound(ctx: DeviceContext, work: Working, packet: Ipv4Packet, event: EventBuilder): PolicyVerdict {
    const quoted = NatPackets.quotedOf(packet)
    if (quoted !== null) {
      const entry = NatTable.quoted(work.rows, quoted.flow)
      if (entry === undefined) return PASS(packet)
      const local = mapped(entry, 'local', quoted.flow.src.port)
      touch(ctx, work, entry, false)
      event.note(3, 'in', NatNotes.of('translatedError', { from: NatNotes.endpoint(quoted.flow.src), to: NatNotes.endpoint(local) }))
      return PASS(NatPackets.withQuotedSource(packet, quoted.error, local))
    }
    const flow = NatPackets.flowOf(packet)
    const entry = flow === null ? NatTable.simpleByGlobal(work.rows, packet.dst) : NatTable.inbound(work.rows, flow)
    if (entry === undefined) {
      if (!NatConfig.isInsideGlobal(work.device, work.nat, packet.dst)) return PASS(packet)
      miss(ctx, work)
      event.note(3, 'in', NatNotes.of('noTranslation', { dst: packet.dst }))
      return { kind: 'drop', reason: 'natNoTranslation' }
    }
    const from: NatEndpoint = flow?.dst ?? { ip: packet.dst }
    const to = mapped(entry, 'local', from.port)
    touch(ctx, work, entry, flow?.closing ?? false)
    event.note(3, 'in', NatNotes.of('translatedIn', { from: NatNotes.endpoint(from), to: NatNotes.endpoint(to) }))
    return PASS(NatPackets.withDestination(packet, to))
  }

  private static outbound(ctx: DeviceContext, work: Working, packet: Ipv4Packet, event: EventBuilder): PolicyVerdict {
    const flow = NatPackets.flowOf(packet)
    if (flow === null) return NatPolicy.addressOnly(ctx, work, packet, event)
    const entry = NatTable.outbound(work.rows, flow)
    if (entry !== undefined) {
      touch(ctx, work, entry, flow.closing)
      return NatPolicy.translated(packet, flow, mapped(entry, 'global', flow.src.port), event)
    }
    const echoReply = packet.payload.kind === 'icmp' && packet.payload.type === 'echoReply'
    const allocation = new NatAllocator(work.device, work.nat, work.rows, ctx.now).allocate(flow, echoReply)
    const local = NatNotes.endpoint(flow.src)
    switch (allocation.kind) {
      case 'none':
        event.note(3, 'out', NatNotes.of('notSelected', { src: flow.src.ip }))
        return PASS(packet)
      case 'noAddress': {
        const iface = allocation.rule.target.kind === 'interface' ? allocation.rule.target.interfaceId : ''
        event.note(3, 'out', NatNotes.of('noAddress', { iface }))
        return PASS(packet)
      }
      case 'exhausted':
        miss(ctx, work)
        event.note(3, 'out', NatNotes.of('poolExhausted', { acl: allocation.rule.aclName, local }))
        return { kind: 'drop', reason: 'natPoolExhausted', icmp: 'host' }
      case 'created': {
        const created = flow.closing && allocation.entry.protocol === 'tcp' ? { ...allocation.entry, expiresAt: ctx.now + NAT_TIMEOUTS.finRst } : allocation.entry
        miss(ctx, work, created)
        const global = mapped(created, 'global', flow.src.port)
        event.note(3, 'out', NatNotes.of('created', { local, acl: allocation.rule.aclName, global: NatNotes.endpoint(global) }))
        return NatPolicy.translated(packet, flow, global, event)
      }
    }
  }

  /** ICMP errors and other protocols: only a simple (address) row can translate them. */
  private static addressOnly(ctx: DeviceContext, work: Working, packet: Ipv4Packet, event: EventBuilder): PolicyVerdict {
    const entry = NatTable.simpleByLocal(work.rows, packet.src)
    if (entry === undefined) {
      event.note(3, 'out', NatNotes.of('protocolNotTranslated'))
      return PASS(packet)
    }
    touch(ctx, work, entry, false)
    const global = { ip: entry.insideGlobal.ip }
    event.note(3, 'out', NatNotes.of('translatedOut', { from: packet.src, to: global.ip }))
    return PASS(NatPackets.withSource(packet, global))
  }

  private static translated(packet: Ipv4Packet, flow: NatFlow, global: NatEndpoint, event: EventBuilder): PolicyVerdict {
    event.note(3, 'out', NatNotes.of('translatedOut', { from: NatNotes.endpoint(flow.src), to: NatNotes.endpoint(global) }))
    return PASS(NatPackets.withSource(packet, global))
  }
}
