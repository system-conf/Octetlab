// Which configuration cards a device gets: from its settings groups and port roles (the device is
// authoritative), plus model capabilities for services a device may switch on later and for the
// VLAN lock of unmanaged switches (SwitchManagement).
import type { Device, DeviceModel, DeviceSection } from '../../../domain'
import { SwitchManagement } from './SwitchManagement'

export type ConfigSectionId =
  | 'general'
  | 'ports'
  | 'host'
  | 'appLinks'
  | 'vlans'
  | 'svis'
  | 'routing'
  | 'dhcp'
  | 'dns'
  | 'wireless'
  | 'internet'
  // Pack 5.2 (docs/SECURITY_PACK.md): agents A, B, C own the cards
  | 'accessLists'
  | 'nat'
  | 'security'

/** Exercise lock section of each card; 'general' (name) follows the device lock only. */
export const LOCK_SECTION_OF: Record<ConfigSectionId, DeviceSection | null> = {
  accessLists: 'security',
  nat: 'security',
  security: 'security',
  general: null,
  ports: 'ports',
  host: 'host',
  appLinks: 'host',
  vlans: 'switching',
  svis: 'switching',
  routing: 'routing',
  dhcp: 'services',
  dns: 'services',
  wireless: 'wireless',
  internet: 'internet',
}

export class DeviceSections {
  /** Cards in display order. */
  static of(device: Device, model: DeviceModel | undefined): ConfigSectionId[] {
    const capabilities = new Set(model?.capabilities ?? [])
    const vlans = device.switching !== undefined && SwitchManagement.vlansConfigurable(model)
    const shown: Record<ConfigSectionId, boolean> = {
      general: true,
      ports: device.ports.some((port) => DeviceSections.isConfigurablePort(port.role)),
      host: device.host !== undefined,
      appLinks: device.host !== undefined && (capabilities.has('appLinks') || device.host.appLinks.length > 0),
      vlans,
      svis: vlans,
      routing: device.routing !== undefined,
      dhcp: device.services?.dhcp !== undefined || capabilities.has('dhcpServer'),
      dns: device.services?.dns !== undefined || capabilities.has('dnsServer'),
      wireless: device.wireless !== undefined,
      internet: device.internet !== undefined || device.kind === 'internet',
      // ACLs on routers and L3 switches (routed ports, SVIs); NAT on routers; SSH on every IOS device.
      accessLists: device.routing !== undefined,
      nat: device.routing !== undefined && device.kind !== 'l3Switch',
      security: device.routing !== undefined || vlans,
    }
    return (Object.keys(shown) as ConfigSectionId[]).filter((section) => shown[section])
  }

  /** Console and passive ports (hub, cloud handoffs) have nothing to set. */
  static isConfigurablePort(role: Device['ports'][number]['role']): boolean {
    return role === 'switched' || role === 'routed' || role === 'host' || role === 'radio'
  }
}
