// Test-only (O3): detectors for the accepted divergences of docs/SIMULATION.md §10.3 and the later
// "Additions" sections. A comparison that falls under one is skipped (and counted), never weakened.
import type { Device, L3Settings, NetworkState, ReachResult } from '../../domain'
import { DeviceAddresses, HostAttachment, Ipv4, L3Interfaces, ReachabilityChecker, SegmentFinder, Topology, type L3Interface } from '../../engine'

/** Why a comparison was skipped; the value names the doc line. */
export const DIVERGENCES = {
  /** §10.3 item 1: gateway is a host or a non-routing device (engine unreachable, simulator timeout). */
  gatewayNotRouter: 'SIMULATION.md §10.3.1',
  /** §10.3 item 2: reply TTL from routers (255 − hops) and from the internet behind ≥ 2 routers. */
  replyTtl: 'SIMULATION.md §10.3.2',
  /** §10.3 item 3: two DHCP servers in one segment (first OFFER wins). */
  twoDhcpServers: 'SIMULATION.md §10.3.3',
  /** §10.3 item 4: DHCP relay (helperAddresses) works in the simulator only. */
  dhcpRelay: 'SIMULATION.md §10.3.4',
  /** §10.3 item 5: DNS forwarder chains deeper than 4 servers. */
  deepDnsChain: 'SIMULATION.md §10.3.5',
  /** "Additions after S2", first bullet: tracert shows the router once, then "reports:" at the next hop. */
  tracertRouterReports: 'SIMULATION.md Additions after S2 (1)',
  /** Terminal / nslookup / renew on a powered-off device: the shell answers before any request (§10.1). */
  sourceOff: 'HostCommandShell: device powered off',
  /** §10.3 item 6: ACL and NAT (pack 5.2) exist in the simulator only; a lab that uses them is not compared. */
  securityPolicies: 'SIMULATION.md §10.3.7',
} as const

export type Divergence = keyof typeof DIVERGENCES

const segments = new SegmentFinder()
const reachability = new ReachabilityChecker(segments)

/** The NIC a host would send to `toIp` from, as the engine picks it. */
function sourceInterface(state: NetworkState, device: Device, toIp: string): L3Interface | null {
  const selection = HostAttachment.select(Topology.of(state), device, toIp)
  return selection.ok ? selection.iface : null
}

export class Divergences {
  /** §10.3.1: the engine refused at the source because the gateway's owner does not route. */
  static gatewayNotRouter(state: NetworkState, fromId: string, toIp: string, reach: ReachResult): boolean {
    if (reach.ok || reach.reason !== 'gatewayUnreachable' || reach.atDeviceId !== fromId) return false
    const device = Topology.of(state).require(fromId)
    const iface = sourceInterface(state, device, toIp)
    const gateway = HostAttachment.interfaces(device).gateway
    if (!iface || gateway === '') return false
    const owner = segments.findAddress(state, segments.segment(state, iface), gateway)
    if (!owner) return false
    const ownerDevice = Topology.of(state).find(owner.deviceId)
    return !L3Interfaces.isNetworkSide(owner) || !ownerDevice || !L3Interfaces.isRouter(ownerDevice)
  }

  /** §10.3.2: the answering device routes (255 − hops), or the internet behind two or more routers. */
  static replyTtl(state: NetworkState, targetIp: string, routers: number): boolean {
    const owners = state.devices.filter((device) => device.powered && DeviceAddresses.has(device, targetIp))
    if (Ipv4.isPublic(targetIp)) {
      // A public address owned by a lab device (a provider router, a server "on the internet"): the engine
      // still gives it the internet TTL (§10.3.2, pack 5.2 addition).
      return owners.length > 0 || routers >= 2
    }
    return owners.some((device) => L3Interfaces.isRouter(device))
  }

  /** §10.3.3 / §10.3.4 for one client: servers with a pool for the client's segment, relays in it. */
  static dhcp(state: NetworkState, clientId: string): Divergence | null {
    const topology = Topology.of(state)
    const client = topology.require(clientId)
    for (const nic of HostAttachment.activeNics(topology, client).filter((candidate) => candidate.addressing === 'dhcp')) {
      const members = segments.segment(state, nic).members.filter((member) => member.deviceId !== clientId)
      const relay = members.some((member) => {
        const owner = topology.find(member.deviceId)
        return owner !== undefined && Divergences.helpersOf(owner, member).length > 0
      })
      if (relay) return 'dhcpRelay'
      const servers = new Set<string>()
      for (const member of members) {
        const server = topology.find(member.deviceId)
        const dhcp = server?.services?.dhcp
        if (!server?.powered || !dhcp?.enabled || !L3Interfaces.isAddressed(member)) continue
        if (dhcp.pools.some((pool) => Ipv4.isValid(pool.network) && Ipv4.sameSubnet(pool.network, member.address, member.mask))) servers.add(server.id)
      }
      if (servers.size >= 2) return 'twoDhcpServers'
    }
    return null
  }

  /** §10.3.5: a chain of DNS servers (device → forwarder → …) longer than 4 exists in the lab. */
  static deepDnsChain(state: NetworkState): boolean {
    const byAddress = new Map<string, Device>()
    for (const device of state.devices) {
      if (device.services?.dns?.enabled !== true) continue
      for (const address of DeviceAddresses.of(device)) byAddress.set(address, device)
    }
    const longest = (device: Device, seen: ReadonlySet<string>): number => {
      let best = 1
      for (const forwarder of device.services?.dns?.forwarders ?? []) {
        const next = byAddress.get(forwarder)
        if (next && !seen.has(next.id)) best = Math.max(best, 1 + longest(next, new Set([...seen, next.id])))
      }
      return best
    }
    return [...new Set(byAddress.values())].some((device) => longest(device, new Set([device.id])) > 4)
  }

  /**
   * Additions after S2: a router (not the source) had no route to a private address or failed ARP, and
   * its "unreachable" gets back (a lost one, decision 7, or a broadcast, decision 3, is plain silence).
   */
  static tracertRouterReports(state: NetworkState, fromId: string, toIp: string, reach: ReachResult): boolean {
    if (reach.ok || reach.atDeviceId === fromId) return false
    if (reach.reason !== 'noRouteToDestination' && reach.reason !== 'destinationNotInSegment') return false
    return reachability.trace(state, fromId, toIp).silent !== true
  }

  /**
   * §10.3.7: some device filters or translates packets (pack 5.2): an access list, NAT rules, or a port
   * bound to a list / marked inside or outside. The rule engine ignores all of it, so the whole lab is
   * outside the oracle. vty `access-class` and SSH settings are not packet policies and do not count.
   */
  static securityPolicies(state: NetworkState): boolean {
    return state.devices.some((device) => {
      const features = device.features
      if ((features?.accessLists?.lists.length ?? 0) > 0) return true
      const nat = features?.nat
      if (nat && nat.pools.length + nat.statics.length + nat.dynamics.length > 0) return true
      return Divergences.networkSideL3(device).some(({ features: port }) => port?.natRole !== undefined || port?.accessGroups?.in !== undefined || port?.accessGroups?.out !== undefined)
    })
  }

  /** Layer-3 settings of every routed port, sub-interface and SVI (host NICs ignore ACL / NAT keys). */
  private static networkSideL3(device: Device): L3Settings[] {
    const routed = device.ports.flatMap((port) => (port.role === 'routed' ? [port.l3, ...port.subInterfaces.map((sub) => sub.l3)] : []))
    return [...routed, ...(device.switching?.svis.map((svi) => svi.l3) ?? [])]
  }

  private static helpersOf(device: Device, member: L3Interface): string[] {
    if (member.kind === 'svi') return device.switching?.svis.find((svi) => `Vlan${svi.vlan}` === member.id)?.l3.helperAddresses ?? []
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      if (port.id === member.id) return port.l3.helperAddresses ?? []
      const sub = port.subInterfaces.find((candidate) => candidate.id === member.id)
      if (sub) return sub.l3.helperAddresses ?? []
    }
    return []
  }
}
