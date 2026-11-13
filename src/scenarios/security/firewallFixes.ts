// Test-only: the hint-3 fixes of the firewall pack exercises as state edits (firewallSetup / securitySetup
// helpers, stored the way the firewall CLI stores them), plus the wrong fixes the lessons warn about.
// Shared by the exercise, oracle, session and sample tests.
import type { NetworkState } from '../../domain'
import { PUBLISHED_ADDRESS, WEB_SERVER_ADDRESS } from './dmzWebsite'
import { firewallSettings, nameif, objectStaticNat, webException } from './firewallSetup'
import { accessGroup, accessLists } from './securitySetup'
import { editDevice } from './securityFixes'

/** mallShopFirewall: `no access-group OUTSIDE_IN in interface outside` (the list itself may stay). */
export function removeOpenBinding(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(state, firewallId, (device) => ({
    ...device,
    ports: device.ports.map((port) => {
      if (port.id !== 'Gi0/0' || port.role !== 'routed') return port
      const features = { ...port.l3.features }
      delete features.accessGroups
      return { ...port, l3: { ...port.l3, features } }
    }),
  }))
}

/** dmzWebsite: `object network WEB_SERVER` with static NAT 172.16.1.10 → 203.0.113.10 plus the outside exception. */
export function publishWebServer(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(
    state,
    firewallId,
    objectStaticNat('WEB_SERVER', WEB_SERVER_ADDRESS, PUBLISHED_ADDRESS, { nameif: 'dmz', portId: 'Gi0/2' }, { nameif: 'outside', portId: 'Gi0/0' }),
    accessLists([webException(WEB_SERVER_ADDRESS)]),
    accessGroup('Gi0/0', 'OUTSIDE_IN', 'in'),
  )
}

/** dmzWebsite wrong fix: the exception without the translation (nothing answers at 203.0.113.10). */
export function exceptionWithoutNat(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(state, firewallId, accessLists([webException(WEB_SERVER_ADDRESS)]), accessGroup('Gi0/0', 'OUTSIDE_IN', 'in'))
}

/** dmzWebsite wrong fix: the translation without the exception (outside 0 → dmz 50 has no rule). */
export function natWithoutException(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(
    state,
    firewallId,
    objectStaticNat('WEB_SERVER', WEB_SERVER_ADDRESS, PUBLISHED_ADDRESS, { nameif: 'dmz', portId: 'Gi0/2' }, { nameif: 'outside', portId: 'Gi0/0' }),
  )
}

/** clinicFirewallLevel: `interface Gi0/1`, `security-level 100` (the name may stay "lan"). */
export function raiseInsideLevel(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(state, firewallId, nameif('Gi0/1', 'lan', 100))
}

/** clinicFirewallLevel wrong fix: `same-security-traffic permit inter-interface` (locked by the security section). */
export function permitSameSecurity(state: NetworkState, firewallId = 'firewall'): NetworkState {
  return editDevice(state, firewallId, firewallSettings({ sameSecurityInterInterface: true }))
}

/** Hint-3 fix per firewall exercise id. */
export const FIREWALL_EXERCISE_FIXES: Readonly<Record<string, (state: NetworkState) => NetworkState>> = {
  mallShopFirewall: (state) => removeOpenBinding(state),
  dmzWebsite: (state) => publishWebServer(state),
  clinicFirewallLevel: (state) => raiseInsideLevel(state),
}
