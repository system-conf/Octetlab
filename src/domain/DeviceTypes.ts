// Device model (docs/MODEL_V2.md §3).
import type { AccessListSettings } from './AccessListTypes'
import type { ManagementSettings } from './ManagementTypes'
import type { NatSettings } from './NatTypes'
import type { L3Settings, Port } from './PortTypes'
import type { DeviceServices, InternetSettings } from './ServiceTypes'

/**
 * What a device is: icon, palette category and default behaviour. Feature differences between
 * models of one kind (port count, PoE, layer-3 switching) come from the DeviceModel and the
 * device's own ports and settings, never from the kind alone.
 */
export type DeviceKind =
  | 'internet'
  | 'router'
  | 'wirelessRouter'
  | 'switch'
  | 'l3Switch'
  | 'hub'
  | 'accessPoint'
  | 'pc'
  | 'laptop'
  | 'server'
  | 'printer'
  | 'ipPhone'
  | 'pos'
  | 'camera'
  | 'nvr'
  | 'kitchenDisplay'
  | 'smartphone'
  | 'tablet'

/** Kinds that are end devices: they carry `host` settings and have `host` ports. */
export const END_DEVICE_KINDS: readonly DeviceKind[] = [
  'pc',
  'laptop',
  'server',
  'printer',
  'ipPhone',
  'pos',
  'camera',
  'nvr',
  'kitchenDisplay',
  'smartphone',
  'tablet',
]

export function isEndDeviceKind(kind: DeviceKind): boolean {
  return END_DEVICE_KINDS.includes(kind)
}

/**
 * Application-level dependency of an end device on an address (a PC's printer, an NVR's cameras).
 * Replaced by real application traffic (HTTP, RTSP…) in the server pack 5.5.
 */
export interface AppLink {
  id: string
  /** User content in labs; placeholder (= id) in exercises, localized from `exercises:<id>.appLinks`. */
  label: string
  targetIp: string
  targetKind: DeviceKind
}

/** End-device settings ("global settings"). The NIC addresses live on the HostPorts. */
export interface HostSettings {
  /** '' = not set. Written by DHCP when a NIC uses 'dhcp' (the last lease wins). */
  defaultGateway: string
  /** Primary first; [] = none. Written by DHCP like the gateway. */
  dnsServers: string[]
  appLinks: AppLink[]
}

/** One entry of the VLAN database (`vlan <id>` / `name <name>`). */
export interface VlanEntry {
  /** 1..4094 */
  id: number
  /** IOS defaults: 'default' for VLAN 1, 'VLAN0010' for VLAN 10. */
  name: string
}

/** Switch virtual interface (`interface Vlan<vlan>`): management address or L3-switch gateway. */
export interface Svi {
  /** The interface id is `Vlan<vlan>`, e.g. 'Vlan10'. */
  vlan: number
  adminUp: boolean
  description?: string
  l3: L3Settings
}

/** Extension point for switch-wide protocol packs (pattern: see L3Features). */
export interface SwitchingFeatures {
  /** Pack 5.1: STP mode, bridge priority per VLAN. */
  stp?: never
  /** Pack 5.8: VTP domain / mode. */
  vtp?: never
  /** Pack 5.6: DHCP snooping, dynamic ARP inspection. */
  dhcpSnooping?: never
  arpInspection?: never
}

/** Layer-2 switching of a switch, L3 switch or wireless router. */
export interface SwitchingSettings {
  /**
   * VLAN database, sorted by id; always contains VLAN 1. An access port in a VLAN missing here
   * forwards nothing (IOS: inactive) and trunks carry only VLANs listed here.
   */
  vlans: VlanEntry[]
  svis: Svi[]
  /** `ip default-gateway` used by a layer-2 switch for its management SVI; '' = none. */
  defaultGateway: string
  features?: SwitchingFeatures
}

interface StaticRouteBase {
  /** Destination network, e.g. '0.0.0.0' for the default route. */
  prefix: string
  mask: string
  /** Administrative distance; 1 for static routes unless set (floating static routes use more). */
  adminDistance: number
}

/**
 * `ip route <prefix> <mask> {<nextHop> | <exitInterfaceId> [<nextHop>]} [<ad>]`. At least one of
 * next hop and exit interface is set. `exitInterfaceId` is a port id, sub-interface id or SVI id.
 */
export type StaticRoute = StaticRouteBase &
  ({ nextHop: string; exitInterfaceId?: string } | { nextHop?: never; exitInterfaceId: string })

/** Extension point for dynamic routing packs 5.3 / 5.7 (pattern: see L3Features). */
export interface RoutingFeatures {
  rip?: never
  ospf?: never
  eigrp?: never
  bgp?: never
}

/** Layer-3 forwarding of a router, L3 switch or wireless router. */
export interface RoutingSettings {
  /** `ip routing`: on for routers, off by default on L3 switches. */
  ipRouting: boolean
  staticRoutes: StaticRoute[]
  features?: RoutingFeatures
}

/** Wireless security of an SSID. Pack 5.6 adds `{ mode: 'wpa2Personal'; passphrase }` and others. */
export type WirelessSecurity = { mode: 'open' }

export interface SsidSettings {
  ssid: string
  /** VLAN the SSID is bridged into on the wired side. */
  vlan: number
  security: WirelessSecurity
}

/** Radio side of an access point or wireless router. */
export interface WirelessSettings {
  ssids: SsidSettings[]
  /** Reserved for the wireless pack 5.6 / physical workspace 5.9: channel, band, range. */
  radio?: never
}

/** Extension point for device-wide packs (pattern: see L3Features). */
export interface DeviceFeatures {
  /** Phase 4 (K4, docs/CLI.md §5): hostname, enable secret, lines, banner, startup-config. */
  management?: ManagementSettings
  /** Pack 5.2: numbered / named ACL definitions (docs/SECURITY_PACK.md). */
  accessLists?: AccessListSettings
  /** Pack 5.2: NAT pools, static mappings, overload. */
  nat?: NatSettings
  /** Pack 5.1: CDP / LLDP. */
  discovery?: never
  /** Pack 5.8: SNMP, NetFlow. */
  monitoring?: never
}

/**
 * One device in a lab. Settings bags are present only where they apply (a switch has no `host`).
 * `ports` is authoritative: it is created from the model's port templates and may differ later
 * (migrated labs, modules in the physical view).
 */
export interface Device {
  /** camelCase, unique in the lab; referenced by links, layout and exercise conditions. */
  id: string
  kind: DeviceKind
  /** DeviceModel id from the catalog (src/catalog). */
  modelId: string
  /** User content in labs; placeholder (= id) in exercises, localized from `exercises:<id>.devices`. */
  name: string
  powered: boolean
  /**
   * Burned-in base MAC of the device: identity for bridge ids and SVIs. Frames use the port MACs.
   * For end devices it equals the MAC of the primary NIC.
   */
  baseMac: string
  ports: Port[]
  /** End devices. */
  host?: HostSettings
  /** Switches, L3 switches, wireless routers. */
  switching?: SwitchingSettings
  /** Routers, L3 switches, wireless routers. */
  routing?: RoutingSettings
  /** Access points, wireless routers. */
  wireless?: WirelessSettings
  /** DHCP / DNS (and later server services) running on the device. */
  services?: DeviceServices
  /** The 'internet' cloud device only. */
  internet?: InternetSettings
  features?: DeviceFeatures
}
