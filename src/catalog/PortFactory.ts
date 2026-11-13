// Creates devices from catalog models: template → default Port, plus the per-kind settings groups.
//
// Default conventions (documented in the C1 report):
// - Router (kind 'router') interfaces start `shutdown` like real IOS routers; everything else starts
//   up: switchports (IOS default `no shutdown`), home-router ports, AP, hub, cloud, host NICs.
// - Switchports: access VLAN 1, native VLAN 1, allowed 'all'; an access point's uplink is a trunk
//   (it bridges SSID VLANs, as the migration does). PoE-capable ports get `power inline auto`.
// - Routed ports: no address (`static`, ''); the home router's WAN port uses DHCP.
// - Host NICs: DHCP without an address.
// - MACs: the first Ethernet / Wi-Fi port of non-switching devices uses the base MAC (for end
//   devices = primary NIC); every other port gets MacAddress.derive(base, portIndex + 1). Switches,
//   L3 switches and hubs derive every port (the base is the bridge identity), as in the migration.
import { MacAddress, type DeviceKind, type DeviceModel, type Device, type Port, type PortTemplate } from '../domain'
import { RandomBaseMacSource, type BaseMacSource } from './BaseMacSource'
import { DeviceDefaults } from './DeviceDefaults'

export interface CreateDeviceOptions {
  /** Base MAC to use instead of one from the factory's source (deterministic per call). */
  baseMac?: string
}

/** Kinds whose ports all get derived MACs (the base MAC is the bridge identity). */
const BRIDGE_KINDS: ReadonlySet<DeviceKind> = new Set<DeviceKind>(['switch', 'l3Switch', 'hub'])

function carriesMac(template: PortTemplate): boolean {
  return template.medium !== 'serial' && template.medium !== 'console'
}

export class PortFactory {
  private static readonly shared = new PortFactory()

  private readonly defaults = new DeviceDefaults()
  private readonly macSource: BaseMacSource

  constructor(macSource: BaseMacSource = new RandomBaseMacSource()) {
    this.macSource = macSource
  }

  /** Same as `new PortFactory().createDevice(…)` with random base MACs. */
  static createDevice(model: DeviceModel, id: string, name: string, options: CreateDeviceOptions = {}): Device {
    return PortFactory.shared.createDevice(model, id, name, options)
  }

  /** A powered device with every port of the model and the kind's default settings groups. */
  createDevice(model: DeviceModel, id: string, name: string, options: CreateDeviceOptions = {}): Device {
    const baseMac = MacAddress.normalize(options.baseMac ?? this.macSource.next())
    const ports = this.createPorts(model, baseMac)
    return {
      id,
      kind: model.kind,
      modelId: model.id,
      name,
      powered: true,
      baseMac,
      ports,
      ...this.defaults.settingsFor(model.kind, ports),
    }
  }

  /** Default port for one template on a device of `kind`; `mac` is ignored for serial / console. */
  createPort(template: PortTemplate, kind: DeviceKind, mac?: string): Port {
    const base = {
      id: template.id,
      medium: template.medium,
      ...(mac !== undefined && carriesMac(template) ? { mac } : {}),
      ...(template.poe === true ? { poe: 'auto' as const } : {}),
      ...(template.pinout === undefined ? {} : { pinout: template.pinout }),
    }
    switch (template.role) {
      case 'switched':
        return {
          ...base,
          role: 'switched',
          adminUp: true,
          l2: { mode: kind === 'accessPoint' ? 'trunk' : 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' },
        }
      case 'routed':
        return {
          ...base,
          role: 'routed',
          // Router and firewall interfaces start shut down (IOS / appliance factory state).
          adminUp: kind !== 'router' && kind !== 'firewall',
          l3: { ipv4: { addressing: kind === 'wirelessRouter' ? 'dhcp' : 'static', address: '', mask: '' } },
          subInterfaces: [],
        }
      case 'host':
        return { ...base, role: 'host', adminUp: true, l3: { ipv4: { addressing: 'dhcp', address: '', mask: '' } } }
      case 'radio':
      case 'console':
      case 'passive':
        return { ...base, role: template.role, adminUp: true }
    }
  }

  private createPorts(model: DeviceModel, baseMac: string): Port[] {
    const primaryIndex = BRIDGE_KINDS.has(model.kind) ? -1 : model.ports.findIndex(carriesMac)
    return model.ports.map((template, index) => {
      const mac = index === primaryIndex ? baseMac : MacAddress.derive(baseMac, index + 1)
      return this.createPort(template, model.kind, mac)
    })
  }
}
