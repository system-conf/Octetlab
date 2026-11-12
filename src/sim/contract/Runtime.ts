// Per-device runtime state of the simulator (docs/SIMULATION.md §4): what the devices learned while
// running, kept apart from the lab configuration (NetworkState). Immutable, JSON-serializable; one slice
// per layer so S1 / S2 / S3 never write the same object. Timers run on the virtual clock: aging is
// lazy (`expiresAt` compared with the current time), protocol timers are queued tasks (SimTimer).
import type { LinkRuntime, LinkTimer } from './LinkLayerState'
import type { NetworkRuntime, NetworkTimer } from './NetworkLayerState'
import type { AclCounters, NatStatistics, NatTranslation } from './SecurityRuntime'
import type { ServiceRuntime, ServiceTimer } from './ServiceLayerState'

/**
 * Reserved runtime slots for the protocol packs (pattern of the model's `never` keys). The pack gives
 * its key a type and keeps it in step with its configuration.
 */
export interface RuntimeExtensions {
  /** 5.1: per-VLAN spanning tree (root, port roles / states, BPDU timers). */
  stp?: never
  /** 5.1: EtherChannel bundles, port security violations, CDP / LLDP neighbours. */
  etherChannel?: never
  portSecurity?: never
  neighbors?: never
  /** 5.2 (docs/SECURITY_PACK.md §5): NAT translation table and counters (agent B), ACL hit counters (agent A). */
  natTranslations?: readonly NatTranslation[]
  natStatistics?: NatStatistics
  aclCounters?: AclCounters
  /** 5.3: RIP / OSPF / EIGRP databases and neighbours, HSRP state. */
  rip?: never
  ospf?: never
  eigrp?: never
  hsrp?: never
  /** 5.4: IPv6 neighbour cache, SLAAC / DHCPv6 state. */
  ipv6?: never
  /** 5.6: DHCP snooping binding table. */
  dhcpSnooping?: never
}

export interface DeviceRuntime {
  readonly deviceId: string
  readonly link: LinkRuntime
  readonly network: NetworkRuntime
  readonly services: ServiceRuntime
  readonly extensions?: RuntimeExtensions
}

/** A timer queued on the virtual clock; `layer` says which layer's onTimer receives it. */
export type SimTimer = LinkTimer | NetworkTimer | ServiceTimer
