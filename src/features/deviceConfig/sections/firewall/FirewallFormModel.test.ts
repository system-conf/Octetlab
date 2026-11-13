import { describe, expect, it } from 'vitest'
import { findDeviceModel } from '../../../../catalog'
import type { Device, Port } from '../../../../domain'
import { makeDevice, routedPort } from '../../../../domain/testDevices'
import { firewallSettingsSchema } from '../../../../lab/schemas/firewallSchemas'
import { DeviceSections, LOCK_SECTION_OF } from '../../model/DeviceSections'
import { FirewallConnectionsModel } from './FirewallConnectionsModel'
import { FirewallFormModel } from './FirewallFormModel'
import { FirewallInterfaceRules } from './FirewallInterfaceRules'

function withSub(port: Port): Port {
  if (port.role !== 'routed') return port
  return { ...port, subInterfaces: [{ id: `${port.id}.10`, vlan: 10, adminUp: true, l3: { ipv4: { addressing: 'static', address: '', mask: '' } } }] }
}

function firewall(): Device {
  const outside = routedPort('Gi0/0')
  const ports: Port[] = [
    outside.role === 'routed' ? { ...outside, l3: { ...outside.l3, features: { natRole: 'outside', firewall: { nameif: 'outside', securityLevel: 0 } } } } : outside,
    withSub(routedPort('Gi0/1')),
  ]
  return { ...makeDevice('fw', 'firewall', ports), routing: { ipRouting: true, staticRoutes: [] } }
}

describe('FirewallFormModel', () => {
  it('lists every routed interface and starts from the factory values', () => {
    const draft = FirewallFormModel.toDraft(firewall())
    expect(draft.interfaces).toEqual([
      { id: 'Gi0/0', nameif: 'outside', securityLevel: '0' },
      { id: 'Gi0/1', nameif: '', securityLevel: '' },
      { id: 'Gi0/1.10', nameif: '', securityLevel: '' },
    ])
    expect(draft).toMatchObject({ sameSecurityInterInterface: false, sameSecurityIntraInterface: false, inspectIcmp: true, timeouts: { tcp: '3600', halfClosed: '600', udp: '120', icmp: '2' } })
  })

  it('round-trips without changes and stores factory values as absent keys', () => {
    const device = firewall()
    expect(FirewallFormModel.apply(device, FirewallFormModel.toDraft(device))).toEqual(device)
  })

  it('applies interfaces, switches and timeouts and keeps other features', () => {
    const device = firewall()
    const draft = FirewallFormModel.toDraft(device)
    const edited = {
      ...draft,
      interfaces: [draft.interfaces[0]!, { id: 'Gi0/1', nameif: 'inside', securityLevel: '' }, { id: 'Gi0/1.10', nameif: 'dmz', securityLevel: '50' }],
      sameSecurityInterInterface: true,
      inspectIcmp: false,
      timeouts: { ...draft.timeouts, udp: '30' },
    }
    expect(FirewallFormModel.isValid(FirewallFormModel.validate(edited))).toBe(true)
    const next = FirewallFormModel.apply(device, edited)
    expect(next.features?.firewall).toEqual({ sameSecurityInterInterface: true, inspectIcmp: false, timeouts: { udp: 30 } })
    expect(firewallSettingsSchema.safeParse(next.features?.firewall).success).toBe(true)
    expect(FirewallInterfaceRules.interfacesOf(next)).toEqual([
      { id: 'Gi0/0', settings: { nameif: 'outside', securityLevel: 0 } },
      { id: 'Gi0/1', settings: { nameif: 'inside' } },
      { id: 'Gi0/1.10', settings: { nameif: 'dmz', securityLevel: 50 } },
    ])
    expect(next.ports[0]).toMatchObject({ l3: { features: { natRole: 'outside' } } })
    expect(FirewallFormModel.toDraft(next)).toEqual(edited)
  })

  it('refuses duplicate names, bad levels and timeouts', () => {
    const draft = FirewallFormModel.toDraft(firewall())
    const errors = FirewallFormModel.validate({
      ...draft,
      interfaces: [draft.interfaces[0]!, { id: 'Gi0/1', nameif: 'outside', securityLevel: '101' }, { id: 'Gi0/1.10', nameif: '', securityLevel: '5' }],
      timeouts: { ...draft.timeouts, tcp: '1h', icmp: '604801' },
    })
    expect(errors.interfaces[0]?.nameif?.key).toBe('firewall:errors.duplicateNameif')
    expect(errors.interfaces[1]).toMatchObject({ nameif: { key: 'firewall:errors.duplicateNameif' }, securityLevel: { key: 'firewall:errors.securityLevelOutOfRange' } })
    expect(errors.interfaces[2]?.securityLevel?.key).toBe('firewall:errors.levelNeedsNameif')
    expect(Object.keys(errors.timeouts).sort()).toEqual(['icmp', 'tcp'])
    expect(FirewallFormModel.isValid(errors)).toBe(false)
  })

  it('uses the default level 100 for inside only (D8)', () => {
    expect(FirewallInterfaceRules.effectiveLevel({ nameif: 'inside' })).toBe(100)
    expect(FirewallInterfaceRules.effectiveLevel({ nameif: 'dmz' })).toBe(0)
    expect(FirewallInterfaceRules.effectiveLevel({ nameif: 'inside', securityLevel: 40 })).toBe(40)
  })
})

describe('Firewall card placement', () => {
  it('shows only for firewall devices and follows the security lock', () => {
    const fw = firewall()
    expect(DeviceSections.of(fw, findDeviceModel('firewall2Port'))).toContain('firewall')
    const router = { ...makeDevice('r1', 'router', [routedPort('Gi0/0')]), routing: { ipRouting: true, staticRoutes: [] } }
    expect(DeviceSections.of(router, findDeviceModel('router2Port'))).not.toContain('firewall')
    expect(LOCK_SECTION_OF.firewall).toBe('security')
  })
})

describe('FirewallConnectionsModel', () => {
  it('keeps live rows only, oldest first, with idle seconds', () => {
    const base = { protocol: 'tcp' as const, initiator: { ip: '192.168.1.10', port: 51000 }, responder: { ip: '8.8.8.8', port: 80 }, inInterface: 'inside', outInterface: 'outside', state: 'established' as const, createdAt: 0, bytes: 120 }
    const rows = FirewallConnectionsModel.rows([
      { ...base, id: 2, lastUsedAt: 1000, expiresAt: 9000 },
      { ...base, id: 1, lastUsedAt: 2500, expiresAt: 9000 },
      { ...base, id: 3, lastUsedAt: 0, expiresAt: 4000 },
    ], 5000)
    expect(rows.map((row) => row.id)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({ from: 'inside 192.168.1.10:51000', to: 'outside 8.8.8.8:80', idleSeconds: 2 })
  })
})
