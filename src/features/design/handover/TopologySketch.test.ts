import { describe, expect, it } from 'vitest'
import { createLabFromState } from '../../../lab/createLab'
import { officeReferenceState } from '../../../design/testBriefs'
import { labHost, labRouter } from '../../../engine/testLabs'
import { TopologySketch } from './TopologySketch'

describe('TopologySketch', () => {
  it('draws nothing for an empty lab', () => {
    expect(TopologySketch.build(createLabFromState({ devices: [], links: [] }, { devices: {} }))).toBeNull()
  })

  it('places devices at their node centres, cables between them and fits the view around everything', () => {
    const state = officeReferenceState()
    const layout = { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 100 * index, y: 50 }])) }
    const doc = {
      ...createLabFromState(state, layout),
      annotations: [{ id: 'office', type: 'rectangle' as const, at: { x: -200, y: 0 }, width: 100, height: 400, label: 'Office', filled: true, color: 'blue' as const }],
    }
    const sketch = TopologySketch.build(doc)
    if (!sketch) throw new Error('expected a sketch')
    expect(sketch.nodes).toHaveLength(state.devices.length)
    expect(sketch.nodes[0]).toMatchObject({ id: 'isp', x: 32, y: 78 })
    expect(sketch.links).toHaveLength(state.links.length)
    expect(sketch.links[0]).toMatchObject({ id: 'wan', connected: true, wireless: false })
    expect(sketch.zones).toEqual([{ id: 'office', x: -200, y: 0, width: 100, height: 400, label: 'Office', ellipse: false, color: 'blue' }])
    expect(sketch.viewBox.x).toBe(-264)
    expect(sketch.viewBox.y).toBe(-64)
    expect(sketch.viewBox.height).toBe(528)
  })

  it('labels end devices with their address and turns text annotations into note boxes', () => {
    const state = officeReferenceState()
    const layout = { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 100 * index, y: 50 }])) }
    const doc = {
      ...createLabFromState(state, layout),
      annotations: [
        { id: 'n1', type: 'text' as const, at: { x: 0, y: 600 }, text: 'Trunk to the AP\nVLAN 30', size: 'small' as const, color: 'red' as const },
        { id: 'blank', type: 'text' as const, at: { x: 0, y: 0 }, text: '  ', size: 'small' as const, color: 'red' as const },
      ],
    }
    const sketch = TopologySketch.build(doc)
    if (!sketch) throw new Error('expected a sketch')
    expect(sketch.notes).toHaveLength(1)
    expect(sketch.notes[0]).toMatchObject({ id: 'n1', x: 0, y: 600, lines: ['Trunk to the AP', 'VLAN 30'], color: 'red', fontSize: 13 })
    expect(sketch.viewBox.y + sketch.viewBox.height).toBeGreaterThan(600 + (sketch.notes[0]?.height ?? 0))
    const routerLike = sketch.nodes.filter((node) => node.kind === 'router' || node.kind === 'switch' || node.kind === 'internet')
    for (const node of routerLike) expect(node.address).toBeUndefined()
  })

  it('shows the address of an end device with a static address', () => {
    const state = { devices: [labHost('pc1', '10.0.0.5'), labRouter('r1', [{ id: 'Gi0/0', ip: '10.0.0.1' }])], links: [] }
    const sketch = TopologySketch.build(createLabFromState(state, { devices: { pc1: { x: 0, y: 0 }, r1: { x: 100, y: 0 } } }))
    expect(sketch?.nodes.find((node) => node.id === 'pc1')?.address).toBe('10.0.0.5/24')
    expect(sketch?.nodes.find((node) => node.id === 'r1')?.address).toBeUndefined()
  })

  it('puts devices without a position in a row below the others', () => {
    const state = officeReferenceState()
    const sketch = TopologySketch.build(createLabFromState(state, { devices: { isp: { x: 0, y: 0 } } }))
    expect(sketch?.nodes.find((node) => node.id === 'pc1')?.y).toBe(28 + 96)
  })
})
