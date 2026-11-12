import { describe, expect, it } from 'vitest'
import type { L3Settings } from '../../../domain'
import { makeDevice } from '../../../domain/testDevices'
import { PortSecurityModel } from './PortSecurityModel'

const plain: L3Settings = { ipv4: { addressing: 'static', address: '10.0.0.1', mask: '255.255.255.0' } }

describe('PortSecurityModel', () => {
  it('round-trips bindings and removes empty ones', () => {
    const bound = PortSecurityModel.apply(plain, { aclIn: ' 101 ', aclOut: '', natRole: 'inside' })
    expect(bound.features).toEqual({ accessGroups: { in: '101' }, natRole: 'inside' })
    expect(PortSecurityModel.toDraft(bound)).toEqual({ aclIn: '101', aclOut: '', natRole: 'inside' })
    expect(PortSecurityModel.apply(bound, { aclIn: '', aclOut: '', natRole: '' })).toEqual(plain)
  })

  it('refuses names with spaces and shows NAT only on routers', () => {
    expect(PortSecurityModel.nameError('BLOCK WEB')).toBeDefined()
    expect(PortSecurityModel.nameError('BLOCK_WEB')).toBeUndefined()
    const router = { ...makeDevice('r1', 'router', []), routing: { ipRouting: true, staticRoutes: [] } }
    const l3Switch = { ...router, kind: 'l3Switch' as const }
    expect(PortSecurityModel.showsNat(router, 'routed')).toBe(true)
    expect(PortSecurityModel.showsNat(l3Switch, 'routed')).toBe(false)
    expect(PortSecurityModel.showsAcl(router, 'switched')).toBe(false)
  })
})
