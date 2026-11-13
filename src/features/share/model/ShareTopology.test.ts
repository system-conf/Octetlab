import { describe, expect, it } from 'vitest'
import { createEmptyLab } from '../../../lab/createLab'
import { ShareTopology } from './ShareTopology'
import { shareTestLab } from './testShareLab'

const box = { width: 1200, height: 630, padding: { top: 50, right: 60, bottom: 100, left: 60 } }

describe('ShareTopology', () => {
  it('fits every device inside the padded frame and draws every cable', () => {
    const doc = shareTestLab()
    const frame = ShareTopology.fit(doc, box)
    expect(frame.nodes).toHaveLength(doc.state.devices.length)
    expect(frame.edges).toHaveLength(doc.state.links.length)
    for (const node of frame.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(60)
      expect(node.x).toBeLessThanOrEqual(1140)
      expect(node.y).toBeGreaterThanOrEqual(50)
      expect(node.y).toBeLessThanOrEqual(530)
    }
    expect(frame.edges.find((edge) => edge.id === 'phoneLink')?.wireless).toBe(true)
    expect(frame.nodes.find((node) => node.id === 'router')?.group).toBe('router')
    expect(frame.nodes.find((node) => node.id === 'guestPc')?.group).toBe('endpoint')
  })

  it('centres a single device and handles an empty lab', () => {
    const doc = shareTestLab()
    const single = { ...doc, state: { devices: doc.state.devices.slice(0, 1), links: [] } }
    const [node] = ShareTopology.fit(single, box).nodes
    expect(node).toMatchObject({ x: 600, y: 290 })
    expect(ShareTopology.fit(createEmptyLab('x'), box)).toMatchObject({ nodes: [], edges: [] })
  })
})
