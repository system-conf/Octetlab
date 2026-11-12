// Semantic invariants of a NetworkState that a type / zod schema cannot express
// (docs/MODEL_V2.md §12). Used by the migration tests and by the lab loader (B2) after parsing.
import { CableRules, type CableRefusal } from './CableRules'
import type { Device } from './DeviceTypes'
import { MacAddress } from './MacAddress'
import type { NetworkState } from './NetworkState'
import { SecurityInvariants, type SecurityInvariantCode } from './SecurityInvariants'

export type InvariantCode =
  | 'duplicateDeviceId'
  | 'duplicateLinkId'
  | 'duplicatePortId'
  /** A sub-interface id is not '<parent>.<n>', or a sub-interface / SVI id clashes with another interface id. */
  | 'badInterfaceId'
  | 'invalidMac'
  /** Two ports (anywhere in the lab) share a MAC. */
  | 'duplicateMac'
  /** VLAN id outside 1..4094 (database, switchport, sub-interface, SVI, SSID). */
  | 'vlanOutOfRange'
  /** The VLAN database lacks VLAN 1. */
  | 'missingDefaultVlan'
  /** A link CableRules refuses (see `reason`). */
  | 'invalidLink'
  /** Pack 5.2 (SecurityInvariants): ACL, NAT pool and local-user data; `name` says which. */
  | SecurityInvariantCode

export interface InvariantViolation {
  code: InvariantCode
  deviceId?: string
  portId?: string
  linkId?: string
  reason?: CableRefusal
  /** ACL, NAT pool or user name (pack 5.2 codes). */
  name?: string
}

function isVlanId(vlan: number): boolean {
  return Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) (seen.has(value) ? repeated : seen).add(value)
  return [...repeated]
}

export class StateInvariants {
  private readonly cableRules = new CableRules()
  private readonly security = new SecurityInvariants()

  /** Every violation, in a stable order; [] = the state is consistent. */
  violations(state: NetworkState): InvariantViolation[] {
    const found: InvariantViolation[] = []
    for (const deviceId of duplicates(state.devices.map((device) => device.id))) {
      found.push({ code: 'duplicateDeviceId', deviceId })
    }
    for (const linkId of duplicates(state.links.map((link) => link.id))) found.push({ code: 'duplicateLinkId', linkId })
    for (const device of state.devices) found.push(...this.deviceViolations(device))
    found.push(...this.macViolations(state))
    for (const link of state.links) {
      const check = this.cableRules.validateLink(state, link)
      if (!check.ok) found.push({ code: 'invalidLink', linkId: link.id, reason: check.reason })
    }
    return found
  }

  private deviceViolations(device: Device): InvariantViolation[] {
    const found: InvariantViolation[] = []
    const deviceId = device.id
    for (const portId of duplicates(device.ports.map((port) => port.id))) {
      found.push({ code: 'duplicatePortId', deviceId, portId })
    }
    const logicalIds = (device.switching?.svis ?? []).map((svi) => `Vlan${svi.vlan}`)
    for (const port of device.ports) {
      if (port.role === 'switched') {
        const { accessVlan, nativeVlan, allowedVlans } = port.l2
        const vlans = [accessVlan, nativeVlan, ...(allowedVlans === 'all' ? [] : allowedVlans)]
        if (!vlans.every(isVlanId)) found.push({ code: 'vlanOutOfRange', deviceId, portId: port.id })
      }
      if (port.role !== 'routed') continue
      for (const subInterface of port.subInterfaces) {
        logicalIds.push(subInterface.id)
        if (!subInterface.id.startsWith(`${port.id}.`)) found.push({ code: 'badInterfaceId', deviceId, portId: subInterface.id })
        if (!isVlanId(subInterface.vlan)) found.push({ code: 'vlanOutOfRange', deviceId, portId: subInterface.id })
      }
    }
    const portIds = new Set(device.ports.map((port) => port.id))
    const clashes = [...duplicates(logicalIds), ...logicalIds.filter((id) => portIds.has(id))]
    for (const portId of clashes) found.push({ code: 'badInterfaceId', deviceId, portId })
    found.push(...this.vlanViolations(device))
    found.push(...this.security.violations(device))
    return found
  }

  private vlanViolations(device: Device): InvariantViolation[] {
    const found: InvariantViolation[] = []
    const deviceId = device.id
    const switching = device.switching
    if (switching) {
      if (!switching.vlans.some((vlan) => vlan.id === 1)) found.push({ code: 'missingDefaultVlan', deviceId })
      const ids = [...switching.vlans.map((vlan) => vlan.id), ...switching.svis.map((svi) => svi.vlan)]
      if (!ids.every(isVlanId)) found.push({ code: 'vlanOutOfRange', deviceId })
    }
    if (!(device.wireless?.ssids ?? []).every((ssid) => isVlanId(ssid.vlan))) found.push({ code: 'vlanOutOfRange', deviceId })
    return found
  }

  private macViolations(state: NetworkState): InvariantViolation[] {
    const found: InvariantViolation[] = []
    const owners = new Map<string, number>()
    for (const device of state.devices) {
      if (!MacAddress.isValid(device.baseMac)) found.push({ code: 'invalidMac', deviceId: device.id })
      for (const port of device.ports) {
        if (port.mac === undefined) continue
        if (!MacAddress.isValid(port.mac)) {
          found.push({ code: 'invalidMac', deviceId: device.id, portId: port.id })
          continue
        }
        const mac = MacAddress.normalize(port.mac)
        const count = (owners.get(mac) ?? 0) + 1
        owners.set(mac, count)
        if (count === 2) found.push({ code: 'duplicateMac', deviceId: device.id, portId: port.id })
      }
    }
    return found
  }
}
