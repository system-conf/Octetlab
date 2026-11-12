// Creates the dynamic translation for an inside→outside flow that has none yet (docs/SECURITY_PACK.md
// §8): the first `ip nat inside source list …` rule whose ACL permits the packet decides. Without
// overload the lowest free pool address is bound to the inside address (a simple entry); with overload
// (pool or interface) the flow gets an extended entry with a PAT port.
import type { AccessList, Device, NatDynamicRule, NatSettings } from '../../../domain'
import { AclMatcher, type AclPacketView } from '../../../net/AclMatcher'
import type { NatTranslation } from '../../contract/SecurityRuntime'
import { NatConfig } from './NatConfig'
import type { NatFlow } from './NatPackets'
import { NatTimeouts } from './NatTimeouts'
import { PatPorts } from './PatPorts'

export type NatAllocation =
  /** A new dynamic row, to be stored. */
  | { readonly kind: 'created'; readonly entry: NatTranslation; readonly rule: NatDynamicRule }
  /** A rule matched but has no free address or port. */
  | { readonly kind: 'exhausted'; readonly rule: NatDynamicRule }
  /** A rule matched but its target interface has no address. */
  | { readonly kind: 'noAddress'; readonly rule: NatDynamicRule }
  /** No rule covers the packet: it leaves untranslated. */
  | { readonly kind: 'none' }

const ICMP_ECHO_REQUEST = 8
const ICMP_ECHO_REPLY = 0

function aclView(flow: NatFlow, echoReply: boolean): AclPacketView {
  if (flow.protocol === 'icmp') return { protocol: 'icmp', src: flow.src.ip, dst: flow.dst.ip, icmpType: echoReply ? ICMP_ECHO_REPLY : ICMP_ECHO_REQUEST, icmpCode: 0 }
  return { protocol: flow.protocol, src: flow.src.ip, dst: flow.dst.ip, srcPort: flow.src.port, dstPort: flow.dst.port }
}

function listOf(device: Device, name: string): AccessList | undefined {
  return device.features?.accessLists?.lists.find((list) => list.name === name)
}

/** A rule's ACL selects the packet. A list that does not exist selects nothing (no translation). */
function selects(device: Device, rule: NatDynamicRule, view: AclPacketView): boolean {
  const list = listOf(device, rule.aclName)
  return list !== undefined && AclMatcher.permits(AclMatcher.decide(list, view))
}

export class NatAllocator {
  private readonly device: Device
  private readonly nat: NatSettings
  private readonly rows: readonly NatTranslation[]
  private readonly now: number

  /** `rows`: every live row (static and dynamic) at `now`. */
  constructor(device: Device, nat: NatSettings, rows: readonly NatTranslation[], now: number) {
    this.device = device
    this.nat = nat
    this.rows = rows
    this.now = now
  }

  allocate(flow: NatFlow, echoReply: boolean): NatAllocation {
    const view = aclView(flow, echoReply)
    const rule = this.nat.dynamics.find((candidate) => selects(this.device, candidate, view))
    if (rule === undefined) return { kind: 'none' }
    if (rule.target.kind === 'interface') {
      const address = NatConfig.addressOf(this.device, rule.target.interfaceId)
      if (address === '') return { kind: 'noAddress', rule }
      return this.overload(rule, flow, [address])
    }
    const poolName = rule.target.poolName
    const pool = this.nat.pools.find((candidate) => candidate.name === poolName)
    const addresses = pool === undefined ? [] : NatConfig.poolAddresses(this.device, pool)
    return rule.overload ? this.overload(rule, flow, addresses) : this.simple(rule, flow, addresses)
  }

  /** Pool without overload: the lowest address no other row holds. */
  private simple(rule: NatDynamicRule, flow: NatFlow, addresses: readonly string[]): NatAllocation {
    const taken = new Set(this.rows.map((entry) => entry.insideGlobal.ip))
    const free = addresses.find((ip) => !taken.has(ip))
    if (free === undefined) return { kind: 'exhausted', rule }
    return { kind: 'created', rule, entry: this.row('any', { ip: flow.src.ip }, { ip: free }, undefined) }
  }

  /**
   * Overload: an inside endpoint keeps the global endpoint it already has (endpoint-independent
   * mapping); otherwise the PAT port is chosen on the first address with room in the port's group.
   */
  private overload(rule: NatDynamicRule, flow: NatFlow, addresses: readonly string[]): NatAllocation {
    const insidePort = flow.src.port ?? 0
    const known = this.rows.find(
      (entry) =>
        entry.origin === 'dynamic' &&
        entry.protocol === flow.protocol &&
        entry.insideLocal.ip === flow.src.ip &&
        entry.insideLocal.port === insidePort &&
        addresses.includes(entry.insideGlobal.ip),
    )
    if (known !== undefined) return { kind: 'created', rule, entry: this.row(flow.protocol, flow.src, known.insideGlobal, flow.dst) }
    for (const ip of addresses) {
      const port = PatPorts.pick(PatPorts.used(this.rows, flow.protocol, ip), flow.protocol, insidePort)
      if (port !== null) return { kind: 'created', rule, entry: this.row(flow.protocol, flow.src, { ip, port }, flow.dst) }
    }
    return { kind: 'exhausted', rule }
  }

  private row(
    protocol: NatTranslation['protocol'],
    insideLocal: NatTranslation['insideLocal'],
    insideGlobal: NatTranslation['insideGlobal'],
    outside: NatTranslation['outsideGlobal'],
  ): NatTranslation {
    const base = { protocol, insideLocal, insideGlobal, origin: 'dynamic' as const, createdAt: this.now, lastUsedAt: this.now, expiresAt: this.now + NatTimeouts.of(protocol) }
    return outside === undefined ? base : { ...base, outsideLocal: outside, outsideGlobal: outside }
  }
}
