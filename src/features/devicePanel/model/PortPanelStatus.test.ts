import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../../catalog'
import type { Device, Link, NetworkState, Port } from '../../../domain'
import { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'
import { ConfigLocks } from '../../deviceConfig'
import { PortPanelStatus, type PortPanelState } from './PortPanelStatus'

let macIndex = 0
function create(modelId: string, id: string): Device {
  const model = findDeviceModel(modelId)
  if (!model) throw new Error(`unknown model ${modelId}`)
  macIndex += 1
  return PortFactory.createDevice(model, id, id, { baseMac: `02:00:00:00:01:${macIndex.toString(16).padStart(2, '0')}` })
}

function editPort(device: Device, portId: string, change: (port: Port) => Port): Device {
  return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
}

function link(id: string, a: [string, string], b: [string, string], connected = true): Link {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected, cable: 'copperStraight' }
}

/** Router Gi0/1 ↔ switch Fa0/8 (up), PC1 ↔ Fa0/1 (up), PC2 ↔ Fa0/2 (unplugged), Fa0/3 shut down. */
function lab(): NetworkState {
  let router = create('router3Port', 'router')
  router = editPort(router, 'Gi0/1', (port) =>
    port.role === 'routed' ? { ...port, adminUp: true, l3: { ipv4: { addressing: 'static', address: '192.168.10.1', mask: '255.255.255.0' } } } : port,
  )
  let staffSwitch = create('switch24', 'staffSwitch')
  staffSwitch = editPort(staffSwitch, 'Fa0/3', (port) => ({ ...port, adminUp: false }))
  staffSwitch = editPort(staffSwitch, 'Fa0/1', (port) => (port.role === 'switched' ? { ...port, l2: { ...port.l2, accessVlan: 10 } } : port))
  return {
    devices: [router, staffSwitch, create('pc', 'pc1'), create('pc', 'pc2')],
    links: [
      link('uplink', ['router', 'Gi0/1'], ['staffSwitch', 'Fa0/8']),
      link('pc1Link', ['pc1', 'eth0'], ['staffSwitch', 'Fa0/1']),
      link('pc2Link', ['pc2', 'eth0'], ['staffSwitch', 'Fa0/2'], false),
    ],
  }
}

function statusOf(state: NetworkState, deviceId: string, policy = ExerciseLockPolicy.none): Map<string, PortPanelState> {
  const device = state.devices.find((candidate) => candidate.id === deviceId)
  if (!device) throw new Error(deviceId)
  return new Map(PortPanelStatus.of(state, device, new ConfigLocks(device.id, policy)).map((port) => [port.portId, port]))
}

describe('PortPanelStatus', () => {
  it('lights cabled ports with a link and draws the plug in the cable type', () => {
    const ports = statusOf(lab(), 'router')
    expect(ports.get('Gi0/1')).toMatchObject({
      condition: 'up',
      lit: true,
      plug: 'copperStraight',
      peers: [{ deviceId: 'staffSwitch', deviceName: 'staffSwitch', portId: 'Fa0/8' }],
      detail: { kind: 'address', ipv4: { address: '192.168.10.1', mask: '255.255.255.0' } },
    })
  })

  it('shows a router interface that is still shut down as shut down, without a plug', () => {
    expect(statusOf(lab(), 'router').get('Gi0/0')).toMatchObject({ condition: 'adminDown', lit: false, plug: null, peers: [] })
  })

  it('tells empty, unplugged and shut-down switchports apart', () => {
    const ports = statusOf(lab(), 'staffSwitch')
    expect(ports.get('Fa0/1')).toMatchObject({ condition: 'up', lit: true, detail: { kind: 'access', vlan: 10 } })
    expect(ports.get('Fa0/2')).toMatchObject({ condition: 'unplugged', lit: false, plug: null })
    expect(ports.get('Fa0/2')?.peers).toHaveLength(1)
    expect(ports.get('Fa0/3')).toMatchObject({ condition: 'adminDown', lit: false })
    expect(ports.get('Fa0/4')).toMatchObject({ condition: 'empty', lit: false, plug: null, peers: [] })
    expect(ports.get('Console')).toMatchObject({ condition: 'empty', detail: { kind: 'none' } })
  })

  it('keeps the plug but darkens the light when the far end is off', () => {
    const state = lab()
    const off = { ...state, devices: state.devices.map((device) => (device.id === 'pc1' ? { ...device, powered: false } : device)) }
    expect(statusOf(off, 'staffSwitch').get('Fa0/1')).toMatchObject({ condition: 'noLink', lit: false, plug: 'copperStraight' })
    expect(statusOf(off, 'pc1').get('eth0')).toMatchObject({ condition: 'deviceOff', lit: false, plug: 'copperStraight' })
  })

  it('does not reveal settings an exercise hides', () => {
    const policy = new ExerciseLockPolicy([{ scope: 'section', deviceId: 'router', section: 'ports', access: 'hidden' }], [])
    const gi0 = statusOf(lab(), 'router', policy).get('Gi0/0')
    // The shutdown is a hidden setting: the panel only shows what the light shows.
    expect(gi0).toMatchObject({ condition: 'empty', detail: { kind: 'hidden' } })
  })

  it('orders conditions from the device down to the cable', () => {
    expect(PortPanelStatus.conditionOf(false, false, 'up')).toBe('deviceOff')
    expect(PortPanelStatus.conditionOf(true, false, 'up')).toBe('adminDown')
    expect(PortPanelStatus.conditionOf(true, null, 'down')).toBe('noLink')
    expect(PortPanelStatus.conditionOf(true, true, 'noCable')).toBe('empty')
  })
})
