// Share pages (docs/SHARE_PAGES.md §6, §7): the lab's devices and cables fitted into a fixed frame,
// for the read-only diagram on the page and the server-rendered Open Graph image. No React, no DOM.
import { isEndDeviceKind, type DeviceKind, type LabDocument } from '../../../domain'

/** Colour group of a device on the diagram. */
export type NodeGroup = 'internet' | 'router' | 'switch' | 'wireless' | 'endpoint'

export interface TopologyNode {
  id: string
  name: string
  group: NodeGroup
  /** Centre in frame coordinates. */
  x: number
  y: number
}

export interface TopologyEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  wireless: boolean
}

export interface TopologyFrame {
  width: number
  height: number
  /** Node radius in frame units (smaller for big labs). */
  radius: number
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

export interface FrameBox {
  width: number
  height: number
  /** Free border around the drawing (the OG image keeps room for its brand strip). */
  padding: { top: number; right: number; bottom: number; left: number }
}

/** Device node size on the workspace canvas: layout positions are top-left corners of this box. */
const CANVAS_NODE = { width: 96, height: 72 }

/** Kinds added later fall back by isEndDeviceKind (end device → 'endpoint', else 'router'). */
const GROUPS: Readonly<Partial<Record<DeviceKind, NodeGroup>>> = {
  internet: 'internet',
  router: 'router',
  firewall: 'router',
  l3Switch: 'router',
  wirelessRouter: 'wireless',
  accessPoint: 'wireless',
  switch: 'switch',
  hub: 'switch',
  pc: 'endpoint',
  laptop: 'endpoint',
  server: 'endpoint',
  printer: 'endpoint',
  ipPhone: 'endpoint',
  pos: 'endpoint',
  camera: 'endpoint',
  nvr: 'endpoint',
  kitchenDisplay: 'endpoint',
  smartphone: 'endpoint',
  tablet: 'endpoint',
}

export class ShareTopology {
  /** Devices and cables scaled (aspect kept) and centred into `box`. */
  static fit(doc: LabDocument, box: FrameBox): TopologyFrame {
    const centres = new Map<string, { x: number; y: number }>()
    for (const device of doc.state.devices) {
      const at = doc.layout.devices[device.id] ?? { x: 0, y: 0 }
      centres.set(device.id, { x: at.x + CANVAS_NODE.width / 2, y: at.y + CANVAS_NODE.height / 2 })
    }
    const points = [...centres.values()]
    if (points.length === 0) return { width: box.width, height: box.height, radius: 20, nodes: [], edges: [] }
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const innerWidth = box.width - box.padding.left - box.padding.right
    const innerHeight = box.height - box.padding.top - box.padding.bottom
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    // A single device (or a single row / column) must not be blown up: never zoom in past 1.5×.
    const scale = Math.min(innerWidth / spanX, innerHeight / spanY, 1.5)
    const offsetX = box.padding.left + (innerWidth - (maxX - minX) * scale) / 2
    const offsetY = box.padding.top + (innerHeight - (maxY - minY) * scale) / 2
    const project = (point: { x: number; y: number }) => ({ x: round(offsetX + (point.x - minX) * scale), y: round(offsetY + (point.y - minY) * scale) })

    const nodes = doc.state.devices.map((device): TopologyNode => {
      const centre = project(centres.get(device.id) ?? { x: minX, y: minY })
      const group = GROUPS[device.kind] ?? (isEndDeviceKind(device.kind) ? 'endpoint' : 'router')
      return { id: device.id, name: device.name, group, ...centre }
    })
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const edges: TopologyEdge[] = []
    for (const link of doc.state.links) {
      const a = byId.get(link.a.deviceId)
      const b = byId.get(link.b.deviceId)
      if (a === undefined || b === undefined) continue
      edges.push({ id: link.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, wireless: link.cable === 'wireless' })
    }
    const radius = Math.max(8, Math.min(26, Math.round(Math.min(innerWidth, innerHeight) / Math.max(6, Math.sqrt(nodes.length) * 4))))
    return { width: box.width, height: box.height, radius, nodes, edges }
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
