// Pure device edits of the firewall command set. Factory values are absent keys (CLI.md §5.1): an empty
// settings block removes `features.firewall`, an empty object list removes `objects`, and an interface
// without nameif has no `l3.features.firewall`, so replaying running-config reproduces the same device.
import type { Device, DeviceFeatures, FirewallInterfaceSettings, FirewallNetworkObject, FirewallSettings, L3Features, L3Settings } from '../../domain'

function compact(settings: FirewallSettings): FirewallSettings {
  const copy: FirewallSettings = { ...settings }
  if (copy.objects !== undefined && copy.objects.length === 0) delete copy.objects
  if (copy.timeouts !== undefined && Object.keys(copy.timeouts).length === 0) delete copy.timeouts
  return copy
}

export class FirewallEdits {
  static settingsOf(device: Device): FirewallSettings {
    return device.features?.firewall ?? {}
  }

  static update(device: Device, change: (settings: FirewallSettings) => FirewallSettings): Device {
    const settings = compact(change(FirewallEdits.settingsOf(device)))
    const features: DeviceFeatures = { ...device.features }
    if (Object.keys(settings).length === 0) delete features.firewall
    else features.firewall = settings
    const copy = { ...device }
    if (Object.keys(features).length === 0) delete copy.features
    else copy.features = features
    return copy
  }

  static objectsOf(device: Device): readonly FirewallNetworkObject[] {
    return FirewallEdits.settingsOf(device).objects ?? []
  }

  static findObject(device: Device, name: string): FirewallNetworkObject | undefined {
    return FirewallEdits.objectsOf(device).find((object) => object.name === name)
  }

  /** Replaces the object with the same name, or appends it. */
  static putObject(device: Device, object: FirewallNetworkObject): Device {
    return FirewallEdits.update(device, (settings) => {
      const objects = settings.objects ?? []
      const exists = objects.some((candidate) => candidate.name === object.name)
      return { ...settings, objects: exists ? objects.map((candidate) => (candidate.name === object.name ? object : candidate)) : [...objects, object] }
    })
  }

  static removeObject(device: Device, name: string): Device {
    return FirewallEdits.update(device, (settings) => ({ ...settings, objects: (settings.objects ?? []).filter((object) => object.name !== name) }))
  }

  /** `l3` with the nameif / level block set (undefined removes it, and an empty `features`). */
  static withInterface(l3: L3Settings, settings: FirewallInterfaceSettings | undefined): L3Settings {
    const features: L3Features = { ...l3.features }
    if (settings === undefined) delete features.firewall
    else features.firewall = settings
    const copy = { ...l3 }
    if (Object.keys(features).length === 0) delete copy.features
    else copy.features = features
    return copy
  }
}
