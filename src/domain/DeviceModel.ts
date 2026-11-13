// Device catalog contract (docs/MODEL_V2.md §7). The catalog data itself lives in src/catalog (C1).
import type { DeviceKind } from './DeviceTypes'
import type { CopperPinout, PortMedium, PortRole } from './PortTypes'

/** Palette group of the workspace. */
export type DeviceCategory = 'routers' | 'switches' | 'wireless' | 'endDevices' | 'servers' | 'wan'

/**
 * Palette sub-category of a model (tab under a top-level palette category). Extensible: a pack
 * adds values here (e.g. 'industrial', 'cellular') and maps them to a top level in the catalog.
 */
export type DeviceSubcategory =
  | 'router'
  | 'switch'
  | 'hub'
  | 'wireless'
  | 'security'
  | 'wanIsp'
  | 'pcLaptop'
  | 'server'
  | 'printer'
  | 'phoneTablet'
  | 'cameraNvr'
  | 'posDisplay'

/**
 * What a model can do. Drives which settings sections, terminals and cable ends the UI offers and
 * what the lab validator accepts. The engine reads the device's own ports and settings, not this list.
 */
export type DeviceCapability =
  /** Routes between its L3 interfaces (`routing` settings). */
  | 'routing'
  /** Bridges between switched ports, has a VLAN database (`switching` settings). */
  | 'l2Switching'
  /** SVIs with routing and `no switchport` ports (L3 switch). */
  | 'l3Switching'
  /** Radio port with SSIDs (`wireless` settings). */
  | 'wireless'
  /** Has a wireless client NIC (wlan0). */
  | 'wirelessClient'
  | 'dhcpServer'
  | 'dnsServer'
  /** Some ports can source PoE. */
  | 'poe'
  /** Windows-style command prompt (ipconfig, ping, …). */
  | 'hostTerminal'
  /** IOS-style CLI (phase 4). */
  | 'deviceCli'
  /** Application links to other devices (printer, cameras, kitchen display). */
  | 'appLinks'
  /** Provides internet service and public DNS (the cloud device). */
  | 'internetService'
  /** Repeats every frame to every port (hub). */
  | 'repeater'
  /** Stateful firewall with interface security levels (docs/FIREWALL_PACK.md). */
  | 'firewall'

/** One physical port of a model, used to create Device.ports when the device is added. */
export interface PortTemplate {
  /** Port id on the created device, e.g. 'Fa0/1'. */
  id: string
  medium: PortMedium
  /** Initial role (a switch port of an L3 switch may later become 'routed'). */
  role: PortRole
  /** Supported speeds in Mbit/s, ascending, e.g. [10, 100] for FastEthernet. [] for console. */
  speedsMbps: readonly number[]
  /** Port can source PoE. */
  poe?: boolean
  /** Copper wiring; absent = derived (CableRules.pinoutOf). */
  pinout?: CopperPinout
  /** Strip layout hint for the physical port strip (owned by C1), e.g. 'wan', 'lan', 'uplink'. */
  group?: string
}

export interface DeviceModel {
  /** camelCase, unique in the catalog; stored in Device.modelId. Never renamed once released. */
  id: string
  kind: DeviceKind
  category: DeviceCategory
  /** Palette tab (second level); the top level is derived from it in the catalog. */
  subcategory: DeviceSubcategory
  /** i18n key of the model name in the `catalog` namespace, e.g. 'catalog:models.router2Port.name'. */
  nameKey: string
  /** i18n key of the "when to use it" text, e.g. 'catalog:models.router2Port.useCase'. */
  useCaseKey: string
  ports: readonly PortTemplate[]
  capabilities: readonly DeviceCapability[]
}
