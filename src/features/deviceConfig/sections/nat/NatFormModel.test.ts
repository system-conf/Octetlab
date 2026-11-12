import { describe, expect, it } from 'vitest'
import type { NatSettings } from '../../../../domain'
import { labRouter } from '../../../../engine/testLabs'
import { NatFormModel } from './NatFormModel'

const NAT: NatSettings = {
  pools: [{ name: 'PUB', start: '203.0.113.9', end: '203.0.113.14', netmask: '255.255.255.248' }],
  statics: [
    { kind: 'static', insideLocal: '192.168.1.50', insideGlobal: '203.0.113.50' },
    { kind: 'static', protocol: 'tcp', insideLocal: '192.168.1.60', insideLocalPort: 80, insideGlobal: '203.0.113.2', insideGlobalPort: 8080 },
  ],
  dynamics: [
    { kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1' }, overload: true },
    { kind: 'dynamic', aclName: 'GUESTS', target: { kind: 'pool', poolName: 'PUB' }, overload: false },
  ],
}

const router = labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '203.0.113.2' }])

describe('NatFormModel', () => {
  it('round-trips the settings through the draft', () => {
    const draft = NatFormModel.toDraft(NAT)
    const errors = NatFormModel.validate(draft, NatFormModel.interfaces(router))
    expect([...errors.pools, ...errors.statics, ...errors.rules].every((row) => Object.keys(row).length === 0)).toBe(true)
    expect(NatFormModel.toSettings(draft)).toEqual(NAT)
  })

  it('an empty draft removes the key (factory = absent)', () => {
    const withNat = { ...router, features: { nat: NAT } }
    expect(NatFormModel.apply(withNat, NatFormModel.toDraft(undefined)).features).toBeUndefined()
  })

  it('reports format and reference errors', () => {
    const draft = NatFormModel.toDraft(undefined)
    draft.pools.push({ ...NatFormModel.newPool(), name: 'P', start: '203.0.113.9', end: '203.0.113.1', netmask: '255.255.255.0' })
    draft.statics.push({ ...NatFormModel.newStatic(), protocol: 'udp', insideLocal: '192.168.1.5', localPort: '70000', insideGlobal: 'x', globalPort: '53' })
    draft.rules.push({ ...NatFormModel.newRule(), aclName: '1', targetKind: 'pool', poolName: 'MISSING' })
    const errors = NatFormModel.validate(draft, NatFormModel.interfaces(router))
    expect(errors.pools[0]?.end?.key).toBe('nat:form.errors.endBeforeStart')
    expect(errors.statics[0]?.localPort?.key).toBe('nat:form.errors.port')
    expect(errors.statics[0]?.insideGlobal?.key).toBe('deviceConfig:errors.invalidAddress')
    expect(errors.rules[0]?.poolName?.key).toBe('nat:form.errors.unknownPool')
  })
})
