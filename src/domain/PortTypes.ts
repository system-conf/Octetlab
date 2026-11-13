// v2 port model: every device has explicit ports (docs/MODEL_V2.md §2).
import type { AclBinding } from './AccessListTypes'
import type { FirewallInterfaceSettings } from './FirewallTypes'
import type { NatRole } from './NatTypes'
// A port's `role` decides which layer-2 / layer-3 settings it carries; the union makes an invalid
// mix (e.g. a switchport with an IP address) a compile error.

/** Physical medium of a port. A cable fits a port only when their media match (CableRules). */
export type PortMedium = 'copper' | 'fiber' | 'wireless' | 'serial' | 'console' | 'coaxial'

/**
 * Logical role of a port:
 * - `switched`: switchport (switch, L3 switch, AP uplink, LAN ports of a wireless router) → `l2`
 * - `routed`: router interface, `no switchport` port of an L3 switch, WAN port → `l3` + sub-interfaces
 * - `host`: NIC of an end device (eth0, wlan0) → `l3`
 * - `radio`: wireless side of an access point / wireless router; SSIDs live on the device (`wireless`)
 * - `console`: console / RS-232 port (no MAC, no addressing)
 * - `passive`: no configuration at all (hub ports, internet cloud handoffs)
 */
export type PortRole = 'switched' | 'routed' | 'host' | 'radio' | 'console' | 'passive'

/** Configured speed in Mbit/s; 'auto' = negotiate (IOS default). */
export type PortSpeed = 'auto' | 10 | 100 | 1000 | 10000

export type PortDuplex = 'auto' | 'full' | 'half'

/**
 * Copper wiring of a port: MDI (hosts, routers, APs) or MDI-X (switches, hubs, the cloud).
 * Only matters when auto-MDIX is off on both ends of a copper link (CableRules).
 */
export type CopperPinout = 'mdi' | 'mdix'

/** PoE sourcing on a port ('power inline auto|never'). Absent on a port = the port cannot source PoE. */
export type PoeMode = 'auto' | 'never'

/** 'static' = typed in by the user; 'dhcp' = learned from a DHCP server (`ip address dhcp` on IOS). */
export type AddressingMode = 'static' | 'dhcp'

export interface Ipv4Settings {
  addressing: AddressingMode
  /** Dotted IPv4 address; '' = no address. With 'dhcp' this is the currently leased address. */
  address: string
  /** Dotted mask, e.g. '255.255.255.0'; '' when there is no address. */
  mask: string
}

/**
 * Extension point for layer-3 protocol packs (docs/MODEL_V2.md §8). Keys are reserved with type
 * `never` (cannot be set yet) and get their real type from the pack that implements them, which
 * is a non-breaking change for stored labs.
 */
export interface L3Features {
  /** ACL pack 5.2: `ip access-group <acl> in|out` (ignored on host NICs). */
  accessGroups?: AclBinding
  /** NAT pack 5.2: `ip nat inside|outside` (ignored on host NICs). */
  natRole?: NatRole
  /** Firewall pack: `nameif` + `security-level` (firewall devices only; ignored elsewhere). */
  firewall?: FirewallInterfaceSettings
  /** Routing packs 5.3: per-interface OSPF / RIP / EIGRP settings (cost, area, passive). */
  ospf?: never
  rip?: never
  eigrp?: never
  /** HSRP pack 5.3: standby groups. */
  hsrp?: never
}

/** Layer-3 settings of a routed port, sub-interface, SVI or host NIC. */
export interface L3Settings {
  ipv4: Ipv4Settings
  /** DHCP relay targets (`ip helper-address`); routed ports, sub-interfaces and SVIs only. */
  helperAddresses?: string[]
  /** Reserved for the IPv6 pack 5.4 (addresses, link-local, SLAAC / DHCPv6). */
  ipv6?: never
  features?: L3Features
}

export type SwitchportMode = 'access' | 'trunk'

/** Extension point for layer-2 protocol packs on a switchport (see L3Features for the pattern). */
export interface SwitchportFeatures {
  /** Pack 5.1: `switchport port-security` (max MACs, sticky, violation mode). */
  portSecurity?: never
  /** Pack 5.1: per-port STP (portfast, bpduguard, cost, priority). */
  stp?: never
  /** Pack 5.1: EtherChannel membership (`channel-group <n> mode …`). */
  channelGroup?: never
  /** Pack 5.6: DHCP snooping / DAI trust. */
  dhcpSnoopingTrusted?: never
  arpInspectionTrusted?: never
  /** Pack 5.8: voice VLAN for IP phones. */
  voiceVlan?: never
}

/** Layer-2 settings of a switchport (IOS `switchport …`). */
export interface SwitchportSettings {
  mode: SwitchportMode
  /** `switchport access vlan`; kept (but unused) while the port is a trunk. */
  accessVlan: number
  /** `switchport trunk native vlan`: untagged frames on a trunk belong to this VLAN. Default 1. */
  nativeVlan: number
  /** `switchport trunk allowed vlan`; 'all' = every VLAN of the VLAN database (IOS default). */
  allowedVlans: 'all' | number[]
  features?: SwitchportFeatures
}

/** Router sub-interface for router-on-a-stick (`interface Gi0/0.10`, `encapsulation dot1Q 10`). */
export interface SubInterface {
  /** '<parent port id>.<number>', e.g. 'Gi0/0.10'. Unique on the device. */
  id: string
  /** 802.1Q VLAN id of `encapsulation dot1Q <vlan>`. */
  vlan: number
  /** `encapsulation dot1Q <vlan> native`: also takes untagged frames. Absent = false. */
  native?: boolean
  adminUp: boolean
  description?: string
  l3: L3Settings
}

/** Serial line settings of a routed serial port. */
export interface SerialSettings {
  /** `clock rate` in bit/s; needed on the DCE end for the line protocol to come up. */
  clockRate?: number
  /** Reserved for the WAN pack 5.7: `encapsulation hdlc|ppp`, PPP authentication. */
  encapsulation?: never
}

interface PortCommon {
  /** Short IOS-style name, unique on the device: 'Fa0/1', 'Gi0/0', 'Se0/0/0', 'Console', 'eth0', 'wlan0'. */
  id: string
  medium: PortMedium
  /** 'AA:BB:CC:DD:EE:FF' for copper / fiber / wireless / coaxial ports; absent for serial and console. */
  mac?: string
  /** false = administratively down (`shutdown`, or a disabled NIC). */
  adminUp: boolean
  description?: string
  /** Absent = 'auto'. */
  speed?: PortSpeed
  /** Absent = 'auto'. */
  duplex?: PortDuplex
  /** Copper only: auto-MDIX (`mdix auto`). Absent = true, so straight and crossover cables both work. */
  autoMdix?: boolean
  /** Copper only: wiring when auto-MDIX is off. Absent = derived from the device (CableRules.pinoutOf). */
  pinout?: CopperPinout
  /** Absent = the port cannot source PoE. */
  poe?: PoeMode
}

export interface SwitchedPort extends PortCommon {
  role: 'switched'
  l2: SwitchportSettings
}

export interface RoutedPort extends PortCommon {
  role: 'routed'
  /** Address of the physical interface; with sub-interfaces it serves untagged (native) frames. */
  l3: L3Settings
  subInterfaces: SubInterface[]
  /** Serial ports only. */
  serial?: SerialSettings
}

export interface HostPort extends PortCommon {
  role: 'host'
  /** Address of the NIC. Default gateway and DNS servers are host-level (HostSettings). */
  l3: L3Settings
}

export interface RadioPort extends PortCommon {
  role: 'radio'
}

export interface ConsolePort extends PortCommon {
  role: 'console'
}

export interface PassivePort extends PortCommon {
  role: 'passive'
}

/** One physical port of a device instance. `Device.ports` is authoritative (see DeviceModel). */
export type Port = SwitchedPort | RoutedPort | HostPort | RadioPort | ConsolePort | PassivePort
