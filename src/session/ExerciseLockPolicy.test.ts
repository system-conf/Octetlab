import { describe, expect, it } from 'vitest'
import type { Device, ExerciseLock, Port } from '../domain'
import { hostNic, makeDevice, switchPort } from '../domain/testDevices'
import { labLink } from '../engine/testLabs'
import { ExerciseLockPolicy } from './ExerciseLockPolicy'

const pc: Device = {
  ...makeDevice('pc', 'pc', [hostNic('eth0'), hostNic('wlan0', 'wireless')]),
  host: { defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'], appLinks: [] },
}
const sw: Device = makeDevice('sw', 'switch', [switchPort('Fa0/1'), switchPort('Fa0/2')])

function withPort(device: Device, portId: string, change: (port: Port) => Port): Device {
  return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
}

describe('ExerciseLockPolicy', () => {
  it('allows everything in a free lab', () => {
    const policy = ExerciseLockPolicy.none
    expect(policy.hasLocks).toBe(false)
    expect(policy.topologyLocked).toBe(false)
    expect(policy.canDeleteLink('link1')).toBe(true)
    expect(policy.deviceAccess('pc')).toBe('editable')
    expect(policy.canUseTerminal('pc')).toBe(true)
    expect(policy.allowsDeviceUpdate(pc, { ...pc, powered: false })).toBe(true)
  })

  it('locks everything in a read-only live lab, notes included', () => {
    const link = labLink('link1', ['pc', 'eth0'], ['sw', 'Fa0/1'])
    const policy = ExerciseLockPolicy.readOnlyLab({ devices: [pc, sw], links: [link] })
    expect(policy.topologyLocked).toBe(true)
    expect(policy.annotationsLocked).toBe(true)
    expect(policy.deviceAccess('pc')).toBe('readOnly')
    expect(policy.canUseTerminal('pc')).toBe(false)
    expect(policy.canUnplugLink('link1')).toBe(false)
    expect(policy.allowsDeviceUpdate(pc, { ...pc, powered: !pc.powered })).toBe(false)
    expect(policy.allowedDeletion({ deviceIds: ['pc'], linkIds: ['link1'], annotationIds: ['annotation1'] })).toEqual({ deviceIds: [], linkIds: [], annotationIds: [] })
    expect(ExerciseLockPolicy.none.annotationsLocked).toBe(false)
  })

  it('locks the topology: no deletes of devices or cables, plugging stays free', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'topology' }], [])
    expect(policy.topologyLocked).toBe(true)
    expect(policy.canDeleteLink('link1')).toBe(false)
    expect(policy.canUnplugLink('link1')).toBe(true)
    expect(policy.allowedDeletion({ deviceIds: ['pc'], linkIds: ['link1'], annotationIds: ['annotation1'] })).toEqual({
      deviceIds: [],
      linkIds: [],
      annotationIds: ['annotation1'],
    })
    expect(policy.allowsDeviceUpdate(pc, { ...pc, host: { ...pc.host, defaultGateway: '10.0.0.1', dnsServers: [], appLinks: [] } })).toBe(true)
  })

  it('locks single links against delete and unplug', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'link', linkId: 'uplink' }], [])
    expect(policy.canDeleteLink('uplink')).toBe(false)
    expect(policy.canUnplugLink('uplink')).toBe(false)
    expect(policy.canDeleteLink('other')).toBe(true)
    expect(policy.allowedDeletion({ deviceIds: ['pc'], linkIds: ['uplink', 'other'], annotationIds: [] }).linkIds).toEqual(['other'])
  })

  it('keeps the devices at both ends of a locked link on delete (the link would go with them)', () => {
    const links = [labLink('uplink', ['pc', 'eth0'], ['sw', 'Fa0/1']), labLink('other', ['laptop', 'eth0'], ['sw', 'Fa0/2'])]
    const policy = new ExerciseLockPolicy([{ scope: 'link', linkId: 'uplink' }], links)
    expect(policy.canDeleteDevice('pc')).toBe(false)
    expect(policy.canDeleteDevice('sw')).toBe(false)
    expect(policy.canDeleteDevice('laptop')).toBe(true)
    expect(policy.allowedDeletion({ deviceIds: ['pc', 'sw', 'laptop'], linkIds: ['uplink', 'other'], annotationIds: [] })).toEqual({
      deviceIds: ['laptop'],
      linkIds: ['other'],
      annotationIds: [],
    })
    // Without link locks the same links change nothing.
    expect(new ExerciseLockPolicy([], links).canDeleteDevice('pc')).toBe(true)
  })

  it('keeps placement-locked devices on delete; moving, cabling and settings stay free', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'placement', deviceId: 'pc' }], [])
    expect(policy.topologyLocked).toBe(false)
    expect(policy.canDeleteDevice('pc')).toBe(false)
    expect(policy.canDeleteDevice('sw')).toBe(true)
    expect(policy.allowedDeletion({ deviceIds: ['pc', 'sw'], linkIds: ['pcLink'], annotationIds: ['zone'] })).toEqual({
      deviceIds: ['sw'],
      linkIds: ['pcLink'],
      annotationIds: ['zone'],
    })
    expect(policy.allowsDeviceUpdate(pc, { ...pc, powered: false })).toBe(true)
  })

  it('takes the strictest of device, section and port locks', () => {
    const locks: ExerciseLock[] = [
      { scope: 'section', deviceId: 'sw', section: 'ports', access: 'readOnly' },
      { scope: 'port', deviceId: 'sw', portId: 'Fa0/2', access: 'hidden' },
      { scope: 'device', deviceId: 'pc', access: 'readOnly' },
      { scope: 'section', deviceId: 'pc', section: 'terminal', access: 'hidden' },
    ]
    const policy = new ExerciseLockPolicy(locks, [])
    expect(policy.portAccess('sw', 'Fa0/1')).toBe('readOnly')
    expect(policy.portAccess('sw', 'Fa0/2')).toBe('hidden')
    expect(policy.sectionAccess('sw', 'power')).toBe('editable')
    expect(policy.sectionAccess('pc', 'host')).toBe('readOnly')
    expect(policy.sectionAccess('pc', 'terminal')).toBe('hidden')
    expect(policy.canUseTerminal('pc')).toBe(false)
    expect(policy.canUseTerminal('sw')).toBe(true)
  })

  it('refuses device updates that touch locked data and accepts the rest', () => {
    const policy = new ExerciseLockPolicy([
      { scope: 'section', deviceId: 'pc', section: 'host', access: 'readOnly' },
      { scope: 'port', deviceId: 'sw', portId: 'Fa0/1', access: 'readOnly' },
      { scope: 'section', deviceId: 'sw', section: 'power', access: 'hidden' },
    ], [])
    const host = pc.host
    if (!host) throw new Error('pc needs host settings')
    expect(policy.allowsDeviceUpdate(pc, { ...pc, host: { ...host, defaultGateway: '10.0.0.1' } })).toBe(false)
    expect(policy.allowsDeviceUpdate(pc, { ...pc, powered: false })).toBe(true)
    expect(policy.allowsDeviceUpdate(sw, withPort(sw, 'Fa0/1', (port) => ({ ...port, adminUp: false })))).toBe(false)
    expect(policy.allowsDeviceUpdate(sw, withPort(sw, 'Fa0/2', (port) => ({ ...port, adminUp: false })))).toBe(true)
    expect(policy.allowsDeviceUpdate(sw, { ...sw, powered: false })).toBe(false)
    expect(policy.allowsDeviceUpdate(sw, { ...sw, id: 'other' })).toBe(false)
  })

  it('ignores key order when comparing locked data', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'device', deviceId: 'pc', access: 'readOnly' }], [])
    const host = pc.host
    if (!host) throw new Error('pc needs host settings')
    const reordered: Device = { ...pc, host: { appLinks: [], dnsServers: [...host.dnsServers], defaultGateway: host.defaultGateway } }
    expect(policy.allowsDeviceUpdate(pc, reordered)).toBe(true)
    expect(policy.allowsDeviceUpdate(pc, { ...pc, name: 'Renamed' })).toBe(false)
  })
})
