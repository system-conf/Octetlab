// Device-wide settings groups of a newly created device, per kind (docs/MODEL_V2.md §3).
// Port-level defaults live in PortFactory.
import type {
  Device,
  DeviceKind,
  DeviceServices,
  L3Settings,
  Port,
  RoutingSettings,
  SwitchingSettings,
  WirelessSettings,
} from '../domain'

/** The settings bags of Device (everything except identity and ports). */
export type DeviceSettingsGroups = Pick<Device, 'host' | 'switching' | 'routing' | 'wireless' | 'services' | 'internet'>

/** SSID a new access point / wireless router broadcasts (open, VLAN 1). User content afterwards. */
export const DEFAULT_SSID = 'Default'

/** Factory LAN of the wireless home router: 192.168.0.1/24, DHCP .100–.149, DNS proxy. */
export const HOME_ROUTER_LAN = {
  address: '192.168.0.1',
  network: '192.168.0.0',
  mask: '255.255.255.0',
  dhcpStart: '192.168.0.100',
  dhcpEnd: '192.168.0.149',
  dnsForwarder: '8.8.8.8',
} as const

/** IOS administrative distance of a default route learned with `ip address dhcp`. */
const DHCP_DEFAULT_ROUTE_DISTANCE = 254

function noAddress(): L3Settings {
  return { ipv4: { addressing: 'static', address: '', mask: '' } }
}

export class DeviceDefaults {
  /** Settings groups for a new device of `kind` with the given (already created) ports. */
  settingsFor(kind: DeviceKind, ports: readonly Port[]): DeviceSettingsGroups {
    switch (kind) {
      case 'internet':
        return { internet: { handoffs: [] } }
      case 'router':
      case 'firewall':
        return { routing: { ipRouting: true, staticRoutes: [] } }
      case 'switch':
        return { switching: this.switching() }
      case 'l3Switch':
        return { switching: this.switching(), routing: { ipRouting: false, staticRoutes: [] } }
      case 'hub':
        return {}
      case 'accessPoint':
        return { wireless: this.wireless() }
      case 'wirelessRouter':
        return this.homeRouter(ports)
      case 'pc':
      case 'laptop':
      case 'server':
      case 'printer':
      case 'ipPhone':
      case 'pos':
      case 'camera':
      case 'nvr':
      case 'kitchenDisplay':
      case 'smartphone':
      case 'tablet':
        return { host: { defaultGateway: '', dnsServers: [], appLinks: [] } }
    }
  }

  /** IOS factory state: VLAN 1 'default' and `interface Vlan1` shut without an address. */
  private switching(): SwitchingSettings {
    return {
      vlans: [{ id: 1, name: 'default' }],
      svis: [{ vlan: 1, adminUp: false, l3: noAddress() }],
      defaultGateway: '',
    }
  }

  private wireless(): WirelessSettings {
    return { ssids: [{ ssid: DEFAULT_SSID, vlan: 1, security: { mode: 'open' } }] }
  }

  /**
   * Works out of the box like a consumer router: LAN SVI 192.168.0.1/24, DHCP pool, DNS proxy and a
   * default route out of the WAN port (the one a DHCP lease from the ISP would install).
   */
  private homeRouter(ports: readonly Port[]): DeviceSettingsGroups {
    const lan = HOME_ROUTER_LAN
    const wan = ports.find((port) => port.role === 'routed')
    const routing: RoutingSettings = {
      ipRouting: true,
      staticRoutes:
        wan === undefined
          ? []
          : [{ prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: DHCP_DEFAULT_ROUTE_DISTANCE, exitInterfaceId: wan.id }],
    }
    const switching: SwitchingSettings = {
      vlans: [{ id: 1, name: 'default' }],
      svis: [{ vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: lan.address, mask: lan.mask } } }],
      defaultGateway: '',
    }
    const services: DeviceServices = {
      dhcp: {
        enabled: true,
        pools: [
          {
            id: 'lan',
            network: lan.network,
            mask: lan.mask,
            range: { start: lan.dhcpStart, end: lan.dhcpEnd },
            defaultRouter: lan.address,
            dnsServers: [lan.address],
            leases: [],
          },
        ],
        excludedRanges: [],
      },
      dns: { enabled: true, forwarders: [lan.dnsForwarder], records: [] },
    }
    return { routing, switching, wireless: this.wireless(), services }
  }
}
