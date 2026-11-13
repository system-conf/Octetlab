// The firewall pack exercises on the simulator: the broken start, the hint-3 fix and the wrong fixes the
// lessons warn about, plus the section locks (docs/FIREWALL_PACK.md §2 D6, §5.1).
import { describe, expect, it } from 'vitest'
import type { NetworkState, SolveCondition } from '../../domain'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import { SimSolveChecker } from '../../sim'
import { clinicFirewallLevel } from './clinicFirewallLevel'
import { dmzWebsite } from './dmzWebsite'
import {
  exceptionWithoutNat,
  natWithoutException,
  permitSameSecurity,
  publishWebServer,
  raiseInsideLevel,
  removeOpenBinding,
} from './firewallFixes'
import { nameif } from './firewallSetup'
import { mallShopFirewall } from './mallShopFirewall'
import { editDevice } from './securityFixes'

function results(state: NetworkState, conditions: readonly SolveCondition[]): boolean[] {
  return SimSolveChecker.check(state, conditions).map((result) => result.ok)
}

function firewallOf(state: NetworkState) {
  const device = state.devices.find((candidate) => candidate.id === 'firewall')
  if (!device) throw new Error('no firewall')
  return device
}

describe('mallShopFirewall', () => {
  it('starts broken: the till reaches the payment server, and so does the neighbour reach the shop', () => {
    expect(results(mallShopFirewall.lab.state, mallShopFirewall.solvedWhen)).toEqual([true, false, false])
  })

  it('is solved by removing the open inbound binding: the answers come back through the connection table', () => {
    expect(results(removeOpenBinding(mallShopFirewall.lab.state), mallShopFirewall.solvedWhen)).toEqual([true, true, true])
  })
})

describe('dmzWebsite', () => {
  it('starts broken: the customer cannot open the site, the office reaches the server, the server cannot reach the office', () => {
    expect(results(dmzWebsite.lab.state, dmzWebsite.solvedWhen)).toEqual([false, true, true])
  })

  it('is solved by static NAT plus an outside exception that names the real address', () => {
    expect(results(publishWebServer(dmzWebsite.lab.state), dmzWebsite.solvedWhen)).toEqual([true, true, true])
  })

  it('is not solved by the exception alone (nothing answers at the public address)', () => {
    expect(results(exceptionWithoutNat(dmzWebsite.lab.state), dmzWebsite.solvedWhen)).toEqual([false, true, true])
  })

  it('is not solved by the translation alone (outside → dmz needs an access rule)', () => {
    expect(results(natWithoutException(dmzWebsite.lab.state), dmzWebsite.solvedWhen)).toEqual([false, true, true])
  })

  it('keeps the firewall routes read-only', () => {
    const policy = new ExerciseLockPolicy(dmzWebsite.locks, dmzWebsite.lab.state.links)
    expect(policy.sectionAccess('firewall', 'routing')).toBe('readOnly')
    const before = firewallOf(dmzWebsite.lab.state)
    expect(policy.allowsDeviceUpdate(before, firewallOf(publishWebServer(dmzWebsite.lab.state)))).toBe(true)
    expect(policy.allowsDeviceUpdate(before, { ...before, routing: { ipRouting: true, staticRoutes: [] } })).toBe(false)
  })
})

describe('clinicFirewallLevel', () => {
  it('starts broken: "lan" without a level is 0, the same as outside, so nothing passes', () => {
    expect(results(clinicFirewallLevel.lab.state, clinicFirewallLevel.solvedWhen)).toEqual([false, false])
  })

  it('is solved by security-level 100 on the inside interface', () => {
    expect(results(raiseInsideLevel(clinicFirewallLevel.lab.state), clinicFirewallLevel.solvedWhen)).toEqual([true, true])
  })

  it('is solved as well by renaming the interface "inside" (level 100 by default)', () => {
    const renamed = editDevice(clinicFirewallLevel.lab.state, 'firewall', nameif('Gi0/1', 'inside'))
    expect(results(renamed, clinicFirewallLevel.solvedWhen)).toEqual([true, true])
  })

  it('locks the security section: the same-security workaround is refused, the level fix is allowed', () => {
    const policy = new ExerciseLockPolicy(clinicFirewallLevel.locks, clinicFirewallLevel.lab.state.links)
    const before = firewallOf(clinicFirewallLevel.lab.state)
    expect(policy.sectionAccess('firewall', 'security')).toBe('readOnly')
    expect(policy.allowsDeviceUpdate(before, firewallOf(permitSameSecurity(clinicFirewallLevel.lab.state)))).toBe(false)
    expect(policy.allowsDeviceUpdate(before, firewallOf(raiseInsideLevel(clinicFirewallLevel.lab.state)))).toBe(true)
  })
})
