// Test-only: the hint-3 fixes of the pack 5.2 exercises as state edits (securitySetup helpers, stored the
// way the CLI stores them). Shared by the exercise, oracle and session tests.
import type { AccessList, NetworkState } from '../../domain'
import type { DeviceChange } from '../design/deviceSetup'
import { ANY, accessGroup, accessLists, interfaceOverload, natRole as natRoleChange, net } from './securitySetup'

/** Applies DeviceChanges to one device of a state. */
export function editDevice(state: NetworkState, deviceId: string, ...changes: DeviceChange[]): NetworkState {
  if (!state.devices.some((device) => device.id === deviceId)) throw new Error(`No device ${deviceId}`)
  return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? changes.reduce((current, change) => change(current), device) : device)) }
}

/** `ip access-group <name> in|out` on a routed port. */
export function bindAcl(state: NetworkState, deviceId: string, portId: string, name: string, direction: 'in' | 'out'): NetworkState {
  return editDevice(state, deviceId, accessGroup(portId, name, direction))
}

/** `ip nat inside|outside` on a routed port. */
export function natRole(state: NetworkState, deviceId: string, portId: string, role: 'inside' | 'outside'): NetworkState {
  return editDevice(state, deviceId, natRoleChange(portId, role))
}

/** `ip access-list extended GUEST_IN`: deny guests → office, permit the rest. */
export const GUEST_IN: AccessList = {
  name: 'GUEST_IN',
  type: 'extended',
  entries: [
    { seq: 10, kind: 'extended', action: 'deny', protocol: 'ip', source: net('192.168.20.0', '0.0.0.255'), destination: net('192.168.10.0', '0.0.0.255') },
    { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY },
  ],
}

/** cafeGuestWifi (and the guest ACL sample): GUEST_IN bound inbound on the guest port Gi0/2. */
export function blockGuests(state: NetworkState, routerId = 'router'): NetworkState {
  return editDevice(state, routerId, accessLists([GUEST_IN]), accessGroup('Gi0/2', 'GUEST_IN', 'in'))
}

/** The wrong fix of the lesson: a standard list that denies the guest network on its own port also cuts guests off the internet. */
export function blockGuestsEverywhere(state: NetworkState, routerId = 'router'): NetworkState {
  const list: AccessList = {
    name: '10',
    type: 'standard',
    entries: [
      { seq: 10, kind: 'standard', action: 'deny', source: net('192.168.20.0', '0.0.0.255') },
      { seq: 20, kind: 'standard', action: 'permit', source: ANY },
    ],
  }
  return editDevice(state, routerId, accessLists([list]), accessGroup('Gi0/2', '10', 'in'))
}

/** officeSharedIp: PAT of 192.168.1.0/24 on Gi0/1 (inside Gi0/0). */
export function overloadOffice(state: NetworkState, routerId = 'router'): NetworkState {
  return editDevice(state, routerId, ...interfaceOverload('1', net('192.168.1.0', '0.0.0.255'), 'Gi0/0', 'Gi0/1'))
}

/** Hint-3 fix per security exercise id. */
export const SECURITY_EXERCISE_FIXES: Readonly<Record<string, (state: NetworkState) => NetworkState>> = {
  cafeGuestWifi: (state) => blockGuests(state),
  officeSharedIp: (state) => overloadOffice(state),
}
