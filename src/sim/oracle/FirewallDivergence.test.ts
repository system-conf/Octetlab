// SIMULATION.md §10.3.8: the rule engine knows no firewall appliance (security levels, connection table),
// so a lab with one is skipped by the oracle as a whole (counted, never compared), even without any
// ACL / NAT data on it.
import { describe, expect, it } from 'vitest'
import { cafeGuestWifi } from '../../scenarios/security/cafeGuestWifi'
import { clinicFirewallLevel } from '../../scenarios/security/clinicFirewallLevel'
import { securityFirewallOffice } from '../../samples/content/firewallSamples'
import { Divergences } from './Divergences'
import { OracleTally } from './OracleChecks'
import { OracleRunner } from './OracleRunner'

describe('Divergences.firewall', () => {
  it('is true for any lab with a firewall appliance, false otherwise', () => {
    expect(Divergences.firewall(clinicFirewallLevel.lab.state)).toBe(true)
    expect(Divergences.securityPolicies(clinicFirewallLevel.lab.state)).toBe(false)
    expect(Divergences.firewall(securityFirewallOffice.lab().state)).toBe(true)
    expect(Divergences.firewall(cafeGuestWifi.lab.state)).toBe(false)
  })
})

describe('OracleRunner on firewall labs', () => {
  it('skips the whole lab and counts it as a firewall skip', () => {
    for (const state of [clinicFirewallLevel.lab.state, securityFirewallOffice.lab().state]) {
      const tally = new OracleTally()
      expect(OracleRunner.check(state, tally)).toEqual([])
      expect(tally.skipped.firewall).toBe(1)
      expect(tally.skipped.securityPolicies).toBeUndefined()
      expect(tally.compared).toEqual({})
    }
  })
})
