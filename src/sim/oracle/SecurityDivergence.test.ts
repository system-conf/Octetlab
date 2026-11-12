// SIMULATION.md §10.3.7: the rule engine ignores ACL and NAT, so a lab that uses either is skipped by the
// oracle as a whole (counted, never compared). vty access-class and SSH settings do not count.
import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { cafeGuestWifi } from '../../scenarios/security/cafeGuestWifi'
import { officeSharedIp } from '../../scenarios/security/officeSharedIp'
import { bindAcl, blockGuests, natRole, overloadOffice } from '../../scenarios/security/securityFixes'
import { Divergences } from './Divergences'
import { OracleTally } from './OracleChecks'
import { OracleRunner } from './OracleRunner'

const cafe = cafeGuestWifi.lab.state
const office = officeSharedIp.lab.state

function withRouter(state: NetworkState, change: (device: NetworkState['devices'][number]) => NetworkState['devices'][number]): NetworkState {
  return { ...state, devices: state.devices.map((device) => (device.id === 'router' ? change(device) : device)) }
}

describe('Divergences.securityPolicies', () => {
  it('is false for labs without ACL / NAT data', () => {
    expect(Divergences.securityPolicies(cafe)).toBe(false)
    expect(Divergences.securityPolicies(office)).toBe(false)
  })

  it('is true for an access list, NAT rules, an access-group binding or a NAT role on its own', () => {
    expect(Divergences.securityPolicies(blockGuests(cafe))).toBe(true)
    expect(Divergences.securityPolicies(overloadOffice(office))).toBe(true)
    // A binding to a list that does not exist permits everything (SECURITY_PACK.md §2.4) but is still skipped.
    expect(Divergences.securityPolicies(bindAcl(cafe, 'router', 'Gi0/2', 'MISSING', 'out'))).toBe(true)
    expect(Divergences.securityPolicies(natRole(office, 'router', 'Gi0/1', 'outside'))).toBe(true)
    const pool = { name: 'P', start: '203.0.113.2', end: '203.0.113.2', netmask: '255.255.255.252' }
    expect(Divergences.securityPolicies(withRouter(office, (device) => ({ ...device, features: { ...device.features, nat: { pools: [pool], statics: [], dynamics: [] } } })))).toBe(true)
  })

  it('ignores empty settings and management-only security (users, SSH, vty access-class)', () => {
    const empty = withRouter(office, (device) => ({
      ...device,
      features: {
        ...device.features,
        accessLists: { lists: [] },
        nat: { pools: [], statics: [], dynamics: [] },
        management: {
          domainName: 'lab.local',
          users: [{ name: 'admin', secret: 'x', privilege: 15 }],
          ssh: { version: 2, rsaKeyBits: 2048 },
          lines: { vty: { loginLocal: true, transportInput: ['ssh'], accessClass: { in: 'MGMT' } } },
        },
      },
    }))
    expect(Divergences.securityPolicies(empty)).toBe(false)
  })
})

describe('OracleRunner on ACL / NAT labs', () => {
  it('skips the whole lab and counts the skip', () => {
    for (const state of [blockGuests(cafe), overloadOffice(office)]) {
      const tally = new OracleTally()
      expect(OracleRunner.check(state, tally)).toEqual([])
      expect(tally.skipped.securityPolicies).toBe(1)
      expect(tally.compared).toEqual({})
    }
  })

  it('still compares the same lab without them', () => {
    const tally = new OracleTally()
    OracleRunner.check(cafe, tally, ['ping'])
    expect(tally.skipped.securityPolicies).toBeUndefined()
    expect(Object.values(tally.compared).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0)
  })
})
