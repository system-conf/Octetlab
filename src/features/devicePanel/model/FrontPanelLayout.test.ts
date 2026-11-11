import { describe, expect, it } from 'vitest'
import { findDeviceModel, PortFactory } from '../../../catalog'
import type { Device, Port } from '../../../domain'
import { FrontPanelLayout } from './FrontPanelLayout'
import { ModelCode } from './ModelCode'
import type { FrontPanelPlan, PanelSocket } from './panelTypes'

function deviceOf(modelId: string): Device {
  const model = findDeviceModel(modelId)
  if (!model) throw new Error(`unknown model ${modelId}`)
  return PortFactory.createDevice(model, modelId, modelId, { baseMac: '02:00:00:00:00:10' })
}

function planOf(modelId: string): FrontPanelPlan {
  const device = deviceOf(modelId)
  return FrontPanelLayout.plan(device, findDeviceModel(modelId))
}

function socket(plan: FrontPanelPlan, portId: string): PanelSocket {
  const found = plan.sockets.find((candidate) => candidate.portId === portId)
  if (!found) throw new Error(`no socket ${portId}`)
  return found
}

/** Every socket, radio and print stays inside the drawing. */
function expectInside(plan: FrontPanelPlan) {
  for (const s of plan.sockets) {
    expect(s.x).toBeGreaterThanOrEqual(0)
    expect(s.x + s.w).toBeLessThanOrEqual(plan.width)
    expect(s.y).toBeGreaterThanOrEqual(0)
    expect(s.y + s.h).toBeLessThanOrEqual(plan.height)
    expect(s.labelAt.y).toBeLessThanOrEqual(plan.height)
    expect(s.labelAt.y).toBeGreaterThan(0)
  }
  for (const r of plan.radios) {
    expect(r.labelAt.y).toBeGreaterThan(0)
    expect(r.led.y).toBeLessThan(plan.height)
  }
}

/** No two sockets overlap. */
function expectNoOverlap(plan: FrontPanelPlan) {
  const sockets = plan.sockets
  for (const [i, a] of sockets.entries()) {
    for (const b of sockets.slice(i + 1)) {
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
      expect(apart, `${a.portId} overlaps ${b.portId}`).toBe(true)
    }
  }
}

describe('FrontPanelLayout chassis', () => {
  it.each([
    ['router3Port', 'rack', 'router'],
    ['router4PortSerial', 'rack', 'router'],
    ['switch8', 'rack', 'switch'],
    ['switch24', 'rack', 'switch'],
    ['switch48', 'rack', 'switch'],
    ['l3Switch24', 'rack', 'switch'],
    ['switch5', 'desktop', 'desktop'],
    ['hub8', 'desktop', 'desktop'],
    ['accessPoint', 'desktop', 'desktop'],
    ['wirelessRouter', 'desktop', 'desktop'],
    ['dslModem', 'desktop', 'desktop'],
    ['pc', 'endDevice', 'endDevice'],
    ['laptop', 'endDevice', 'endDevice'],
    ['server', 'endDevice', 'endDevice'],
    ['internetCloud', 'provider', 'provider'],
  ])('%s sits in a %s housing (%s colours)', (modelId, chassis, tone) => {
    const plan = planOf(modelId)
    expect(plan.chassis).toBe(chassis)
    expect(plan.tone).toBe(tone)
    expect(plan.ears).toBe(chassis === 'rack')
    expectInside(plan)
    expectNoOverlap(plan)
  })
})

describe('FrontPanelLayout ports', () => {
  it('lays a 3-port router out in one row with full ids, lights below and the console on the right', () => {
    const plan = planOf('router3Port')
    expect(plan.sockets.map((s) => [s.portId, s.shape])).toEqual([
      ['Gi0/0', 'rj45'],
      ['Gi0/1', 'rj45'],
      ['Gi0/2', 'rj45'],
      ['Console', 'console'],
    ])
    const gi0 = socket(plan, 'Gi0/0')
    const gi1 = socket(plan, 'Gi0/1')
    expect(gi0.y).toBe(gi1.y)
    expect(gi0.label).toBe('Gi0/0')
    expect(gi0.led?.y).toBeGreaterThan(gi0.y + gi0.h)
    expect(socket(plan, 'Console').led).toBeNull()
    expect(socket(plan, 'Console').x).toBeGreaterThan(gi1.x)
    expect(plan.captions).toEqual([expect.objectContaining({ group: 'ethernet', x1: gi0.x })])
    expect(plan.brand.compact).toBe(false)
    expect(plan.order).toEqual(['Gi0/0', 'Gi0/1', 'Gi0/2', 'Console'])
  })

  it('gives serial ports their own connector shape after the Ethernet group', () => {
    const plan = planOf('router4PortSerial')
    const serial = socket(plan, 'Se0/1/0')
    expect(serial.shape).toBe('serial')
    expect(serial.x).toBeGreaterThan(socket(plan, 'Gi0/3').x)
    expect(plan.captions.map((caption) => caption.group)).toEqual(['ethernet', 'serial'])
  })

  it('keeps 8 ports in a single row', () => {
    const plan = planOf('switch8')
    const ys = new Set(plan.sockets.filter((s) => s.shape === 'rj45').map((s) => s.y))
    expect(ys.size).toBe(1)
    expect(plan.brand.compact).toBe(false)
  })

  it('staggers 24 ports: odd ports on top, even ports below (upside down), gap after 6 columns', () => {
    const plan = planOf('switch24')
    const p1 = socket(plan, 'Fa0/1')
    const p2 = socket(plan, 'Fa0/2')
    const p3 = socket(plan, 'Fa0/3')
    const p11 = socket(plan, 'Fa0/11')
    const p13 = socket(plan, 'Fa0/13')
    expect(p1.x).toBe(p2.x)
    expect(p1.y).toBeLessThan(p2.y)
    expect(p1.flipped).toBe(false)
    expect(p2.flipped).toBe(true)
    expect(p1.label).toBe('1')
    expect(p2.label).toBe('2')
    expect(p1.led?.y).toBeLessThan(p1.y)
    expect(p2.led?.y).toBeGreaterThan(p2.y + p2.h)
    const step = p3.x - p1.x
    expect(p13.x - p11.x).toBeGreaterThan(step)
    expect(plan.brand.compact).toBe(true)
    // Copper uplinks: smaller sockets in a single row after the block.
    const up1 = socket(plan, 'Gi0/1')
    expect(up1.w).toBeLessThan(34)
    expect(up1.x).toBeGreaterThan(socket(plan, 'Fa0/24').x)
    expect(up1.label).toBe('Gi0/1')
    expect(plan.captions.map((caption) => caption.group)).toEqual(['uplink'])
  })

  it('draws the fiber uplinks of a 48-port switch as SFP cages and widens the panel', () => {
    const plan = planOf('switch48')
    expect(plan.sockets.filter((s) => s.shape === 'sfp').map((s) => s.portId)).toEqual(['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4'])
    expect(socket(plan, 'Fa0/48').label).toBe('48')
    expect(plan.width).toBeGreaterThan(planOf('switch24').width)
    // Readable sockets: the panel asks for horizontal scrolling rather than shrinking below ~14 px.
    expect(plan.minDisplayWidth).toBeGreaterThan(plan.width / 2)
  })

  it('numbers a gigabit L3 switch by the last number of its long ids', () => {
    const plan = planOf('l3Switch24')
    expect(socket(plan, 'Gi1/0/24').label).toBe('24')
    expect(socket(plan, 'Gi1/1/1').shape).toBe('sfp')
    expect(socket(plan, 'Gi1/1/1').label).toBe('1')
  })

  it('shows a radio as a Wi-Fi mark with antennas on the desktop box, not as a socket', () => {
    const plan = planOf('wirelessRouter')
    expect(plan.sockets.map((s) => s.portId)).toEqual(['WAN', 'LAN1', 'LAN2', 'LAN3', 'LAN4'])
    expect(plan.radios.map((r) => r.portId)).toEqual(['Radio0'])
    expect(plan.antennas).toHaveLength(2)
    expect(plan.body.y).toBeGreaterThan(20)
    expect(plan.captions.map((caption) => caption.group)).toEqual(['wan', 'lan'])
    expect(plan.order).toEqual(['WAN', 'LAN1', 'LAN2', 'LAN3', 'LAN4', 'Radio0'])
  })

  it('gives an access point its uplink socket and a radio', () => {
    const plan = planOf('accessPoint')
    expect(plan.sockets.map((s) => s.portId)).toEqual(['Gi0'])
    expect(plan.radios.map((r) => r.portId)).toEqual(['Radio0'])
  })

  it('keeps end devices simple: their NICs, a Wi-Fi mark for wlan0, no antennas or ears', () => {
    const pc = planOf('pc')
    expect(pc.sockets.map((s) => s.portId)).toEqual(['eth0'])
    expect(pc.radios).toEqual([])
    const laptop = planOf('laptop')
    expect(laptop.sockets.map((s) => s.portId)).toEqual(['eth0'])
    expect(laptop.radios.map((r) => r.portId)).toEqual(['wlan0'])
    expect(laptop.antennas).toEqual([])
    expect(planOf('server').sockets.map((s) => s.portId)).toEqual(['eth0', 'eth1'])
  })

  it('draws the internet cloud as a provider handoff box with its lines', () => {
    const plan = planOf('internetCloud')
    expect(plan.sockets.map((s) => s.portId)).toEqual(['eth0', 'eth1', 'eth2', 'eth3'])
    expect(plan.captions.map((caption) => caption.group)).toEqual(['handoff'])
  })

  it('places ports the model does not know (migrated labs) last', () => {
    const device = deviceOf('router3Port')
    const extra: Port = { ...device.ports[0], id: 'Gi9/9' } as Port
    const plan = FrontPanelLayout.plan({ ...device, ports: [extra, ...device.ports] }, findDeviceModel('router3Port'))
    expect(socket(plan, 'Gi9/9').x).toBeGreaterThan(socket(plan, 'Gi0/2').x)
    expect(plan.captions.map((caption) => caption.group)).toEqual(['ethernet', 'other'])
  })

  it('works without a catalog model', () => {
    const plan = FrontPanelLayout.plan(deviceOf('switch24'), undefined)
    expect(plan.sockets.length).toBe(27)
    expectNoOverlap(plan)
  })
})

describe('FrontPanelLayout labels', () => {
  it('shortens long ids and hub port names', () => {
    expect(FrontPanelLayout.shortLabel('Gi0/1')).toBe('Gi0/1')
    expect(FrontPanelLayout.shortLabel('Gi1/0/12')).toBe('12')
    expect(FrontPanelLayout.shortLabel('Port3')).toBe('3')
    expect(FrontPanelLayout.shortLabel('LAN1')).toBe('LAN1')
  })
})

describe('ModelCode', () => {
  it.each([
    ['router3Port', 'R3-G'],
    ['router4PortSerial', 'R4S-G'],
    ['switch24', 'S24-FE'],
    ['switch48Poe', 'S48P-FE'],
    ['switch24Gig', 'S24-G'],
    ['l3Switch24', 'L3S24-G'],
    ['switch5', 'S5-G'],
    ['hub8', 'H8-FE'],
    ['wirelessRouter', 'WR5-G'],
    ['dslModem', 'DSL5-G'],
    ['accessPoint', 'AP'],
    ['pc', 'PC'],
    ['internetCloud', 'ISP'],
  ])('%s → %s', (modelId, code) => {
    expect(ModelCode.of(deviceOf(modelId), findDeviceModel(modelId))).toBe(code)
  })
})
