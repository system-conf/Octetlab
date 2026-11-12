// The configuration a device boots with before its startup-config is applied (docs/CLI.md §5.3).
import { findDeviceModel } from '../../catalog/DeviceCatalog'
import { DeviceDefaults } from '../../catalog/DeviceDefaults'
import { PortFactory } from '../../catalog/PortFactory'
import type { Device, ManagementSettings, Port, PortTemplate } from '../../domain'

const factory = new PortFactory()
const defaults = new DeviceDefaults()

/** A template from the port itself, for ports the catalog model does not list (migrated labs). */
function templateOf(port: Port): PortTemplate {
  return {
    id: port.id,
    medium: port.medium,
    role: port.role,
    speedsMbps: [],
    ...(port.poe === undefined ? {} : { poe: true }),
    ...(port.pinout === undefined ? {} : { pinout: port.pinout }),
  }
}

export class FactoryReset {
  /**
   * Factory configuration of the device: identity, power, port ids and MACs kept; ports from the catalog
   * model's templates (an L3-switch port turned routed is a switchport again) and the kind's default
   * settings groups; of the management settings only the NVRAM startup-config and the RSA key pair
   * (`ssh.rsaKeyBits`, kept in NVRAM outside running-config on IOS; docs/SECURITY_PACK.md §2.5) survive.
   */
  static of(device: Device): Device {
    const model = findDeviceModel(device.modelId)
    const templates = new Map((model?.kind === device.kind ? model.ports : []).map((template) => [template.id, template]))
    const ports = device.ports.map((port) => factory.createPort(templates.get(port.id) ?? templateOf(port), device.kind, port.mac))
    const startupConfig = device.features?.management?.startupConfig
    const reset: Device = {
      id: device.id,
      kind: device.kind,
      modelId: device.modelId,
      name: device.name,
      powered: device.powered,
      baseMac: device.baseMac,
      ports,
      ...defaults.settingsFor(device.kind, ports),
    }
    const rsaKeyBits = device.features?.management?.ssh?.rsaKeyBits
    const management: ManagementSettings = {
      ...(startupConfig === undefined ? {} : { startupConfig }),
      ...(rsaKeyBits === undefined ? {} : { ssh: { rsaKeyBits } }),
    }
    return Object.keys(management).length === 0 ? reset : { ...reset, features: { management } }
  }

  /**
   * Every switched / routed port and SVI admin up: the state a startup-config is replayed on. running-config
   * lists every interface and writes `shutdown` for each one that is down, so its absence means up.
   */
  static interfacesUp(device: Device): Device {
    const ports = device.ports.map((port) => (port.role === 'switched' || port.role === 'routed' ? { ...port, adminUp: true } : port))
    const switching = device.switching
    if (switching === undefined) return { ...device, ports }
    return { ...device, ports, switching: { ...switching, svis: switching.svis.map((svi) => ({ ...svi, adminUp: true })) } }
  }
}
