// packet-tracer's pure configuration explanation (docs/FIREWALL_PACK.md §2 D5, §6.4): evaluates the
// configured rules for one imagined packet entering <nameif> and returns the phases ROUTE-LOOKUP,
// ACCESS-LIST, NAT, CONN-SETTINGS, stopping at the first DROP. No packet is sent and no runtime changes.
// The ACCESS-LIST verdict is the engine's own FirewallRules.decide (agent A, §5.1 steps 1, 3–6), so the
// tracer and the simulator cannot disagree; this file adds the route lookup, un-NAT / NAT description and
// the wording. A live connection (step 2) is not considered: the tracer always explains a new flow. The
// wording is a lab text (real phase wording UNVERIFIED, §3).
import type { Device, NatStaticRule } from '../../domain'
import type { AclPacketView } from '../../net/AclMatcher'
import { Ipv4 } from '../../net/Ipv4'
import { type FirewallAclCheck, FirewallRules } from '../../sim/policy/firewall/FirewallRules'
import { AclEdits } from '../acl/AclEdits'
import { AclInterfaces } from '../acl/AclInterfaces'
import { AclSyntax } from '../acl/AclSyntax'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { NatEdits } from '../nat/NatEdits'
import { DEFAULT_TIMEOUTS, FirewallClock } from './FirewallClock'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces, type NamedInterface } from './FirewallInterfaces'

export interface TracedPacket {
  readonly protocol: 'tcp' | 'udp' | 'icmp'
  readonly src: string
  readonly dst: string
  /** TCP / UDP ports; ICMP type and code. */
  readonly srcPort?: number
  readonly dstPort?: number
  readonly icmpType?: number
  readonly icmpCode?: number
}

export type PhaseType = 'ROUTE-LOOKUP' | 'ACCESS-LIST' | 'NAT' | 'CONN-SETTINGS'

export interface TracePhase {
  readonly type: PhaseType
  readonly allowed: boolean
  readonly info: readonly string[]
}

export interface TraceResult {
  readonly inputInterface: string
  readonly outputInterface: string | null
  readonly phases: readonly TracePhase[]
  readonly allowed: boolean
  readonly dropReason: string | null
}

interface Route {
  readonly interfaceId: string
  readonly nextHop: string | null
}

const ECHO_REQUEST = 8

function allow(type: PhaseType, ...info: string[]): TracePhase {
  return { type, allowed: true, info }
}

function drop(type: PhaseType, ...info: string[]): TracePhase {
  return { type, allowed: false, info }
}

export class FirewallDecision {
  /** null when `nameif` names no interface (the command prints its own error). */
  static explain(device: Device, nameif: string, packet: TracedPacket): TraceResult | null {
    const ingress = FirewallInterfaces.byName(device, nameif)
    if (ingress === undefined) return null
    const phases: TracePhase[] = []
    const finish = (output: string | null): TraceResult => {
      const last = phases.at(-1)
      const allowed = last?.allowed ?? false
      return { inputInterface: nameif, outputInterface: output, phases, allowed, dropReason: allowed ? null : (last?.info[0] ?? null) }
    }
    const unNat = FirewallDecision.unNat(device, packet)
    const real: TracedPacket = unNat === undefined ? packet : { ...packet, dst: unNat.insideLocal, ...(unNat.insideLocalPort === undefined ? {} : { dstPort: unNat.insideLocalPort }) }

    if (FirewallDecision.isOwnAddress(device, real.dst)) {
      phases.push(allow('ROUTE-LOOKUP', `destination ${real.dst} is an address of this device`))
      phases.push(allow('ACCESS-LIST', 'traffic to the device itself: security levels and access-groups do not apply (management access rules still do)'))
      return finish(nameif)
    }
    const route = FirewallDecision.route(device, real.dst)
    if (route === null) {
      phases.push(drop('ROUTE-LOOKUP', `no route to host ${real.dst}`))
      return finish(null)
    }
    const egress = FirewallInterfaces.byId(device, route.interfaceId)
    const via = route.nextHop === null ? 'directly connected' : `next-hop ${route.nextHop}`
    if (egress === undefined) {
      phases.push(drop('ROUTE-LOOKUP', `egress interface ${route.interfaceId} has no nameif and carries no traffic`))
      return finish(null)
    }
    phases.push(allow('ROUTE-LOOKUP', `found ${via} using egress interface ${egress.nameif}`))
    phases.push(FirewallDecision.accessPhase(device, ingress, egress, real))
    if (!phases[phases.length - 1]?.allowed) return finish(egress.nameif)
    phases.push(FirewallDecision.natPhase(device, ingress, egress, packet, unNat))
    phases.push(FirewallDecision.connPhase(device, real))
    return finish(egress.nameif)
  }

  /** The verdict is the engine's own (FirewallRules.decide, agent A); this method only words it. */
  private static accessPhase(device: Device, ingress: NamedInterface, egress: NamedInterface, packet: TracedPacket): TracePhase {
    const decision = FirewallRules.decide(device, ingress.iface.id, FirewallDecision.aclView(packet), egress.iface.id)
    const aclTexts = decision.acls.map((check) => FirewallDecision.aclText(device, check))
    const textsOf = (direction: 'in' | 'out'): string[] =>
      decision.acls.flatMap((check) => (check.direction === direction ? [FirewallDecision.aclText(device, check)] : []))
    if (decision.kind === 'drop') {
      switch (decision.reason) {
        case 'aclDenied':
          return drop('ACCESS-LIST', aclTexts.at(-1) ?? 'denied by an access list')
        case 'firewallSameLevel': {
          const word = ingress.iface.id === egress.iface.id ? 'intra-interface' : 'inter-interface'
          return drop('ACCESS-LIST', `same security level ${ingress.level} on ${ingress.nameif} and ${egress.nameif}; same-security-traffic permit ${word} is not configured`)
        }
        case 'firewallDenied':
          return drop('ACCESS-LIST', `no access-group in on ${ingress.nameif}: traffic from level ${ingress.level} to higher level ${egress.level} needs an access list`)
        case 'firewallNoConnection':
          return drop('ACCESS-LIST', 'TCP segment without SYN and no connection')
        case 'firewallNoNameif':
          return drop('ACCESS-LIST', 'an interface on the path has no nameif and carries no traffic')
      }
    }
    const rule =
      decision.rule === 'higherToLower'
        ? [`implicit rule: level ${ingress.level} (${ingress.nameif}) to level ${egress.level} (${egress.nameif}) is allowed`]
        : decision.rule === 'sameLevelPermitted'
          ? [`same security level ${ingress.level}: permitted by same-security-traffic`]
          : []
    return allow('ACCESS-LIST', ...textsOf('in'), ...rule, ...textsOf('out'))
  }

  private static aclText(device: Device, check: FirewallAclCheck): string {
    const { acl, direction, decision } = check
    switch (decision.kind) {
      case 'noList':
        return `access-list ${acl} (${direction}) is missing or empty: permits all`
      case 'implicitDeny':
        return `access-list ${acl} (${direction}): implicit deny`
      case 'match': {
        const entry = AclEdits.find(device, acl)?.entries.find((candidate) => candidate.seq === decision.seq)
        const text = entry === undefined ? '' : `: ${AclSyntax.entryText(entry)}`
        return `access-list ${acl} (${direction}) line ${decision.seq} ${decision.action}${text}`
      }
    }
  }


  private static natPhase(device: Device, ingress: NamedInterface, egress: NamedInterface, packet: TracedPacket, unNat: NatStaticRule | undefined): TracePhase {
    const info: string[] = []
    if (unNat !== undefined) info.push(`untranslate ${packet.dst} to ${unNat.insideLocal}`)
    const source = FirewallDecision.sourceTranslation(device, ingress, egress, packet.src)
    if (source !== null) info.push(`translate ${packet.src} to ${source}`)
    if (info.length === 0) info.push('no translation rule matches')
    return allow('NAT', ...info)
  }

  private static connPhase(device: Device, packet: TracedPacket): TracePhase {
    const settings = FirewallEdits.settingsOf(device)
    const timeouts = { ...DEFAULT_TIMEOUTS, ...settings.timeouts }
    if (packet.protocol === 'tcp') return allow('CONN-SETTINGS', `new TCP connection, idle timeout ${FirewallClock.format(timeouts.tcp)}; replies return through it`)
    if (packet.protocol === 'udp') return allow('CONN-SETTINGS', `new UDP connection, idle timeout ${FirewallClock.format(timeouts.udp)}; replies return through it`)
    if (packet.icmpType !== ECHO_REQUEST) return allow('CONN-SETTINGS', 'ICMP message other than echo: not tracked')
    if (settings.inspectIcmp === false) return allow('CONN-SETTINGS', 'ICMP is not inspected: echo replies count as new traffic and need an access list')
    return allow('CONN-SETTINGS', `ICMP echo tracked (inspect icmp), idle timeout ${FirewallClock.format(timeouts.icmp)}; replies return`)
  }

  private static aclView(packet: TracedPacket): AclPacketView {
    return {
      protocol: packet.protocol,
      src: packet.src,
      dst: packet.dst,
      ...(packet.srcPort === undefined ? {} : { srcPort: packet.srcPort }),
      ...(packet.dstPort === undefined ? {} : { dstPort: packet.dstPort }),
      ...(packet.protocol === 'tcp' ? { tcpFlags: ['syn' as const] } : {}),
      ...(packet.icmpType === undefined ? {} : { icmpType: packet.icmpType }),
      ...(packet.icmpCode === undefined ? {} : { icmpCode: packet.icmpCode }),
    }
  }

  /** The static row whose global side is the destination (D6: rules match the real address). */
  private static unNat(device: Device, packet: TracedPacket): NatStaticRule | undefined {
    return NatEdits.natOf(device).statics.find((rule) => {
      if (rule.insideGlobal !== packet.dst) return false
      if (rule.protocol === undefined) return true
      return rule.protocol === packet.protocol && rule.insideGlobalPort === packet.dstPort
    })
  }

  /** Object NAT of the source between these two interfaces; null when none applies. */
  private static sourceTranslation(device: Device, ingress: NamedInterface, egress: NamedInterface, src: string): string | null {
    for (const object of FirewallEdits.objectsOf(device)) {
      const { address, nat } = object
      if (address === undefined || nat === undefined || nat.realInterface !== ingress.nameif || nat.mappedInterface !== egress.nameif) continue
      const covered = address.kind === 'host' ? address.address === src : Ipv4.inNetwork(src, address.address, address.mask)
      if (!covered) continue
      const target = nat.mapped.kind === 'address' ? nat.mapped.address : egress.l3.ipv4.address
      return `${target} (object ${object.name}, ${nat.type})`
    }
    return null
  }

  private static isOwnAddress(device: Device, ip: string): boolean {
    return DeviceInterfaces.list(device).some((iface) => AclInterfaces.l3Of(iface)?.ipv4.address === ip)
  }

  /** Longest-prefix match over connected networks and static routes (connected wins a tie). */
  private static route(device: Device, dst: string): Route | null {
    const candidates = FirewallDecision.connected(device, dst)
    for (const route of device.routing?.staticRoutes ?? []) {
      const length = Ipv4.prefixLength(route.mask)
      if (length === null || !Ipv4.inNetwork(dst, route.prefix, route.mask)) continue
      // A next hop is resolved over connected networks only (no recursion through other static routes).
      const exit = route.exitInterfaceId ?? FirewallDecision.connected(device, route.nextHop ?? '')[0]?.route.interfaceId
      if (exit !== undefined) candidates.push({ length, route: { interfaceId: exit, nextHop: route.nextHop ?? null } })
    }
    let best: { readonly length: number; readonly route: Route } | undefined
    for (const candidate of candidates) if (best === undefined || candidate.length > best.length) best = candidate
    return best?.route ?? null
  }

  private static connected(device: Device, dst: string): { readonly length: number; readonly route: Route }[] {
    const found: { readonly length: number; readonly route: Route }[] = []
    for (const iface of DeviceInterfaces.list(device)) {
      const ipv4 = AclInterfaces.l3Of(iface)?.ipv4
      if (ipv4 === undefined || ipv4.address === '') continue
      const length = Ipv4.prefixLength(ipv4.mask)
      if (length !== null && length > 0 && Ipv4.inNetwork(dst, ipv4.address, ipv4.mask)) found.push({ length, route: { interfaceId: iface.id, nextHop: null } })
    }
    return found.sort((a, b) => b.length - a.length)
  }
}
