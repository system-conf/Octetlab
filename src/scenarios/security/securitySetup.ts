// Pack 5.2 device settings as DeviceChanges (the deviceSetup pattern), stored the way the CLI stores them
// (docs/SECURITY_PACK.md §3): access lists, interface bindings, NAT and SSH / local AAA. Used by the
// security exercises' fixes and by the security sample labs. They throw on a wrong port id.
import type { AccessList, AclAddressMatch, Device, ManagementSettings, NatSettings, RoutedPort } from '../../domain'
import type { DeviceChange } from '../design/deviceSetup'

/** `any` as stored (no keywords). */
export const ANY: AclAddressMatch = { address: '0.0.0.0', wildcard: '255.255.255.255' }

/** A network and its wildcard, e.g. net('192.168.20.0', '0.0.0.255'). */
export function net(address: string, wildcard: string): AclAddressMatch {
  return { address, wildcard }
}

function changeRoutedPort(device: Device, portId: string, change: (port: RoutedPort) => RoutedPort): Device {
  if (!device.ports.some((port) => port.id === portId && port.role === 'routed')) throw new Error(`${device.id} has no routed port ${portId}`)
  return { ...device, ports: device.ports.map((port) => (port.id === portId && port.role === 'routed' ? change(port) : port)) }
}

/** Adds access lists (`access-list …` / `ip access-list …`) to the device's existing ones. */
export function accessLists(lists: readonly AccessList[]): DeviceChange {
  return (device) => {
    const existing = device.features?.accessLists?.lists ?? []
    return { ...device, features: { ...device.features, accessLists: { lists: [...existing, ...lists] } } }
  }
}

/** `ip access-group <name> in|out` on a routed port. */
export function accessGroup(portId: string, name: string, direction: 'in' | 'out'): DeviceChange {
  return (device) =>
    changeRoutedPort(device, portId, (port) => ({
      ...port,
      l3: { ...port.l3, features: { ...port.l3.features, accessGroups: { ...port.l3.features?.accessGroups, [direction]: name } } },
    }))
}

/** `ip nat inside|outside` on a routed port. */
export function natRole(portId: string, role: 'inside' | 'outside'): DeviceChange {
  return (device) => changeRoutedPort(device, portId, (port) => ({ ...port, l3: { ...port.l3, features: { ...port.l3.features, natRole: role } } }))
}

/** The NAT rules (`ip nat pool`, `ip nat inside source …`); replaces any earlier ones. */
export function natRules(nat: NatSettings): DeviceChange {
  return (device) => ({ ...device, features: { ...device.features, nat } })
}

/** PAT on one interface: `access-list <aclName> permit <inside>`, `ip nat inside source list <aclName> interface <outside> overload`, roles on both ports. */
export function interfaceOverload(aclName: string, inside: AclAddressMatch, insidePortId: string, outsidePortId: string): DeviceChange[] {
  return [
    accessLists([{ name: aclName, type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'permit', source: inside }] }]),
    natRules({ pools: [], statics: [], dynamics: [{ kind: 'dynamic', aclName, target: { kind: 'interface', interfaceId: outsidePortId }, overload: true }] }),
    natRole(insidePortId, 'inside'),
    natRole(outsidePortId, 'outside'),
  ]
}

/** Merges management settings (hostname, users, SSH, lines) into the device's existing ones. */
export function management(settings: ManagementSettings): DeviceChange {
  return (device) => ({ ...device, features: { ...device.features, management: { ...device.features?.management, ...settings } } })
}
