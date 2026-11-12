// Pure device edits of the NAT command set. Factory values are absent keys (lineCommands.ts rule):
// an empty NAT block removes `features.nat`, an empty features block removes `features`, and
// `no ip nat inside` removes the port's `natRole` (and an empty `l3.features`).
import type { Device, DeviceFeatures, L3Features, L3Settings, NatRole, NatSettings } from '../../domain'

const EMPTY_NAT: NatSettings = { pools: [], statics: [], dynamics: [] }

function isEmpty(nat: NatSettings): boolean {
  return nat.pools.length === 0 && nat.statics.length === 0 && nat.dynamics.length === 0
}

export class NatEdits {
  static natOf(device: Device): NatSettings {
    return device.features?.nat ?? EMPTY_NAT
  }

  static update(device: Device, change: (nat: NatSettings) => NatSettings): Device {
    const nat = change(NatEdits.natOf(device))
    const features: DeviceFeatures = { ...device.features }
    if (isEmpty(nat)) delete features.nat
    else features.nat = nat
    const copy = { ...device }
    if (Object.keys(features).length === 0) delete copy.features
    else copy.features = features
    return copy
  }

  /** `l3` with the NAT role set (or removed when undefined). */
  static withRole(l3: L3Settings, role: NatRole | undefined): L3Settings {
    const features: L3Features = { ...l3.features }
    if (role === undefined) delete features.natRole
    else features.natRole = role
    const copy = { ...l3 }
    if (Object.keys(features).length === 0) delete copy.features
    else copy.features = features
    return copy
  }
}
