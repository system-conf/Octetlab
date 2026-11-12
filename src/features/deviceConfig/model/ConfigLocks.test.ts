import { describe, expect, it } from 'vitest'
import type { ExerciseLock } from '../../../domain'
import { cableLab } from '../../../domain/testDevices'
import { findDeviceModel } from '../../../catalog'
import { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'
import { ConfigLocks } from './ConfigLocks'
import { DeviceSections } from './DeviceSections'

describe('ConfigLocks', () => {
  const locks: ExerciseLock[] = [
    { scope: 'topology' },
    { scope: 'section', deviceId: 'router', section: 'routing', access: 'hidden' },
    { scope: 'section', deviceId: 'router', section: 'ports', access: 'readOnly' },
    { scope: 'port', deviceId: 'router', portId: 'Gi0/0', access: 'hidden' },
    { scope: 'device', deviceId: 'pc', access: 'readOnly' },
    { scope: 'section', deviceId: 'pc', section: 'host', access: 'hidden' },
  ]
  const policy = new ExerciseLockPolicy(locks, [])

  it('applies only the locks of its own device', () => {
    const switchLocks = new ConfigLocks('sw', policy)
    expect(switchLocks.device()).toBe('editable')
    expect(switchLocks.section('routing')).toBe('editable')
    expect(switchLocks.port('Gi0/0')).toBe('editable')
  })

  it('takes the strictest of device, section and port locks', () => {
    const router = new ConfigLocks('router', policy)
    expect(router.section('routing')).toBe('hidden')
    expect(router.section('ports')).toBe('readOnly')
    expect(router.port('Se0/0/0')).toBe('readOnly')
    expect(router.port('Gi0/0')).toBe('hidden')
    const pc = new ConfigLocks('pc', policy)
    expect(pc.section('power')).toBe('readOnly')
    expect(pc.section('host')).toBe('hidden')
  })

  it('readOnly makes editable areas read-only but keeps hidden ones hidden', () => {
    const router = new ConfigLocks('router', policy, true)
    expect(router.device()).toBe('readOnly')
    expect(router.section('switching')).toBe('readOnly')
    expect(router.section('routing')).toBe('hidden')
  })

  it('is a per-device view of ExerciseLockPolicy (one set of lock rules)', () => {
    const sections = ['power', 'ports', 'host', 'switching', 'routing', 'wireless', 'services', 'internet', 'terminal'] as const
    for (const deviceId of ['sw', 'router', 'pc']) {
      const view = new ConfigLocks(deviceId, policy)
      expect(view.device()).toBe(policy.deviceAccess(deviceId))
      for (const section of sections) expect(view.section(section)).toBe(policy.sectionAccess(deviceId, section))
      for (const portId of ['Gi0/0', 'Se0/0/0']) expect(view.port(portId)).toBe(policy.portAccess(deviceId, portId))
    }
    expect(new ConfigLocks('router').section('routing')).toBe('editable')
  })
})

describe('DeviceSections', () => {
  it('derives the cards from settings groups and port roles', () => {
    const state = cableLab()
    const byId = (id: string) => {
      const device = state.devices.find((candidate) => candidate.id === id)
      if (!device) throw new Error(id)
      return device
    }
    expect(DeviceSections.of(byId('sw'), undefined)).toEqual(['general', 'ports'])
    expect(DeviceSections.of(byId('ap'), undefined)).toEqual(['general', 'ports', 'wireless'])
    expect(DeviceSections.of(byId('cloud'), undefined)).toEqual(['general', 'internet'])
    const router = { ...byId('router'), routing: { ipRouting: true, staticRoutes: [] } }
    expect(DeviceSections.of(router, findDeviceModel('router2Port'))).toEqual(['general', 'ports', 'routing', 'dhcp', 'dns', 'accessLists', 'nat', 'security'])
    const pc = { ...byId('pc'), host: { defaultGateway: '', dnsServers: [], appLinks: [] } }
    expect(DeviceSections.of(pc, undefined)).toEqual(['general', 'ports', 'host'])
    expect(DeviceSections.of(pc, findDeviceModel('pos'))).toContain('appLinks')
    const sw = { ...byId('sw'), switching: { vlans: [{ id: 1, name: 'default' }], svis: [], defaultGateway: '' } }
    expect(DeviceSections.of(sw, undefined)).toEqual(['general', 'ports', 'vlans', 'svis', 'security'])
  })
})
