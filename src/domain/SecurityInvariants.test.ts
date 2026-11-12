import { describe, expect, it } from 'vitest'
import type { AccessList, Device } from '.'
import { SecurityInvariants } from './SecurityInvariants'
import { makeDevice } from './testDevices'

function routerWith(features: Device['features']): Device {
  return { ...makeDevice('r1', 'router', []), features }
}

const standard10: AccessList = {
  name: '10',
  type: 'standard',
  entries: [{ seq: 10, kind: 'standard', action: 'permit', source: { address: '10.0.0.0', wildcard: '0.0.0.255' } }],
}

describe('SecurityInvariants', () => {
  const invariants = new SecurityInvariants()

  it('accepts a device without pack 5.2 data and a consistent one', () => {
    expect(invariants.violations(routerWith(undefined))).toEqual([])
    expect(invariants.violations(routerWith({ accessLists: { lists: [standard10, { name: 'WEB', type: 'extended', entries: [] }] } }))).toEqual([])
  })

  it('reports duplicate names, bad numbers and duplicate sequence numbers', () => {
    const duplicateSeq: AccessList = { ...standard10, name: '11', entries: [...standard10.entries, ...standard10.entries] }
    const wrongRange: AccessList = { name: '101', type: 'standard', entries: [] }
    const found = invariants.violations(routerWith({ accessLists: { lists: [standard10, standard10, duplicateSeq, wrongRange] } }))
    expect(found).toEqual([
      { code: 'duplicateAclName', deviceId: 'r1', name: '10' },
      { code: 'duplicateAclSeq', deviceId: 'r1', name: '11' },
      { code: 'aclNumberOutOfRange', deviceId: 'r1', name: '101' },
    ])
  })

  it('reports duplicate NAT pools and users', () => {
    const pool = { name: 'P', start: '203.0.113.1', end: '203.0.113.5', netmask: '255.255.255.248' }
    const found = invariants.violations(
      routerWith({ nat: { pools: [pool, pool], statics: [], dynamics: [] }, management: { users: [{ name: 'admin' }, { name: 'admin' }] } }),
    )
    expect(found.map((violation) => violation.code)).toEqual(['duplicateNatPool', 'duplicateUser'])
  })

  it('knows the numbered ranges', () => {
    expect(SecurityInvariants.numberFits('1350', 'standard')).toBe(true)
    expect(SecurityInvariants.numberFits('2000', 'extended')).toBe(true)
    expect(SecurityInvariants.numberFits('200', 'extended')).toBe(false)
    expect(SecurityInvariants.numberFits('BLOCK', 'standard')).toBe(true)
  })
})
