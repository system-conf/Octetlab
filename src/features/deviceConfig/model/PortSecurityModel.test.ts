import { describe, expect, it } from 'vitest'
import type { Device, L3Settings, Port } from '../../../domain'
import { makeDevice, routedPort } from '../../../domain/testDevices'
import { PortEditorModel } from './PortEditorModel'
import { PortSecurityModel, type PortSecurityDraft } from './PortSecurityModel'

const plain: L3Settings = { ipv4: { addressing: 'static', address: '10.0.0.1', mask: '255.255.255.0' } }
const empty: PortSecurityDraft = { aclIn: '', aclOut: '', natRole: '', nameif: '', securityLevel: '' }

function named(port: Port, nameif: string): Port {
  return port.role === 'routed' ? { ...port, l3: { ...port.l3, features: { firewall: { nameif } } } } : port
}

function firewall(): Device {
  return { ...makeDevice('fw', 'firewall', [named(routedPort('Gi0/0'), 'outside'), routedPort('Gi0/1')]), routing: { ipRouting: true, staticRoutes: [] } }
}

describe('PortSecurityModel', () => {
  it('round-trips bindings and removes empty ones', () => {
    const bound = PortSecurityModel.apply(plain, { ...empty, aclIn: ' 101 ', natRole: 'inside' })
    expect(bound.features).toEqual({ accessGroups: { in: '101' }, natRole: 'inside' })
    expect(PortSecurityModel.toDraft(bound)).toEqual({ ...empty, aclIn: '101', natRole: 'inside' })
    expect(PortSecurityModel.apply(bound, empty)).toEqual(plain)
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

  it('shows nameif and level on firewall routed ports only', () => {
    const router = { ...makeDevice('r1', 'router', []), routing: { ipRouting: true, staticRoutes: [] } }
    expect(PortSecurityModel.showsFirewall(firewall(), 'routed')).toBe(true)
    expect(PortSecurityModel.showsFirewall(router, 'routed')).toBe(false)
    expect(PortSecurityModel.firewallErrors(router, 'Gi0/0', 'routed', { ...empty, securityLevel: '500' })).toEqual({})
  })

  it('round-trips nameif and level and keeps the other features', () => {
    const bound = PortSecurityModel.apply({ ...plain, features: { natRole: 'outside' } }, { ...empty, natRole: 'outside', nameif: ' dmz ', securityLevel: '50' })
    expect(bound.features).toEqual({ natRole: 'outside', firewall: { nameif: 'dmz', securityLevel: 50 } })
    expect(PortSecurityModel.toDraft(bound)).toEqual({ ...empty, natRole: 'outside', nameif: 'dmz', securityLevel: '50' })
    expect(PortSecurityModel.apply(bound, { ...empty, natRole: 'outside', nameif: 'inside' }).features).toEqual({ natRole: 'outside', firewall: { nameif: 'inside' } })
    expect(PortSecurityModel.apply(bound, empty)).toEqual(plain)
  })

  it('validates nameif uniqueness and the level range with the invariant codes', () => {
    const device = firewall()
    const check = (portId: string, nameif: string, securityLevel: string) => PortSecurityModel.firewallErrors(device, portId, 'routed', { ...empty, nameif, securityLevel })
    expect(check('Gi0/1', 'outside', '')).toEqual({ nameif: { key: 'firewall:errors.duplicateNameif', params: { name: 'outside' } } })
    expect(check('Gi0/0', 'outside', '0')).toEqual({})
    expect(check('Gi0/1', 'in side', '101').nameif?.key).toBe('firewall:errors.nameifInvalid')
    expect(check('Gi0/1', 'inside', '101').securityLevel?.key).toBe('firewall:errors.securityLevelOutOfRange')
    expect(check('Gi0/1', 'inside', '-1').securityLevel?.key).toBe('firewall:errors.securityLevelOutOfRange')
    expect(check('Gi0/1', '', '10').securityLevel?.key).toBe('firewall:errors.levelNeedsNameif')
    expect(check('Gi0/1', '', '')).toEqual({})
  })

  it('blocks the port editor on a firewall error', () => {
    const device = firewall()
    const port = device.ports[1]
    if (port === undefined) throw new Error('Gi0/1')
    const draft = PortEditorModel.toDraft(port)
    const duplicate = { ...draft, security: { ...draft.security, nameif: 'outside' } }
    expect(PortEditorModel.isValid(PortEditorModel.validate(duplicate, port, device))).toBe(false)
    expect(PortEditorModel.isValid(PortEditorModel.validate(duplicate, port))).toBe(true)
    const inside = { ...draft, security: { ...draft.security, nameif: 'inside', securityLevel: '100' } }
    expect(PortEditorModel.apply(inside, port)).toMatchObject({ l3: { features: { firewall: { nameif: 'inside', securityLevel: 100 } } } })
  })
})
