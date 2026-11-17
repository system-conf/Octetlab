import { withPrefix } from '../../../design/handover/DeviceListBuilder'
import type { AnnotationColor, Device, DeviceKind, LabDocument } from '../../../domain'
import { L3Interfaces } from '../../../engine'

/** Size of a device node on the workspace canvas; layout positions are its top-left corner. */
const NODE_WIDTH = 64
const NODE_HEIGHT = 56
/** Room around the drawing (name and address labels below nodes). */
const MARGIN = 64
/** Spacing of devices that have no position yet (placed in a row below the others). */
const ROW_SPACING = 96
/** Font size of a canvas note per size, and the estimated glyph width (fraction of the font size). */
export const NOTE_FONT_SIZE = { small: 13, medium: 15, large: 19 } as const
const NOTE_GLYPH_WIDTH = 0.56
const NOTE_LINE_HEIGHT = 1.35
const NOTE_PADDING = 8

export interface SketchNode {
  id: string
  name: string
  kind: DeviceKind
  modelId: string
  /** Centre of the node. */
  x: number
  y: number
  /** End devices: the address of their first addressed network card, e.g. '192.168.10.5/24'. */
  address?: string
}

/** A text note of the canvas as a box: top-left corner, estimated size and its lines. */
export interface SketchNote {
  id: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  lines: string[]
  color: AnnotationColor
}

export interface SketchLink {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  connected: boolean
  wireless: boolean
}

export interface SketchZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  label?: string
  ellipse: boolean
  color: AnnotationColor
}

export interface TopologySketchView {
  viewBox: { x: number; y: number; width: number; height: number }
  zones: SketchZone[]
  links: SketchLink[]
  nodes: SketchNode[]
  notes: SketchNote[]
}

/** The first addressed network card of an end device; routers and switches have several, so none. */
function hostAddress(device: Device): string | undefined {
  const nic = L3Interfaces.of(device).find((iface) => iface.kind === 'nic' && L3Interfaces.isAddressed(iface))
  return nic === undefined ? undefined : withPrefix(nic.address, nic.mask)
}

/**
 * A static picture of a lab for the handover pack, drawn from the canvas layout: zones (rectangle /
 * ellipse annotations), cables, devices with their addresses and the text notes. Null for a lab
 * without devices. Pure.
 */
export class TopologySketch {
  static build(doc: Pick<LabDocument, 'state' | 'layout' | 'annotations'>): TopologySketchView | null {
    const { devices, links } = doc.state
    if (devices.length === 0) return null
    const placed = devices.flatMap((device) => {
      const at = doc.layout.devices[device.id]
      return at === undefined ? [] : [{ device, x: at.x + NODE_WIDTH / 2, y: at.y + NODE_HEIGHT / 2 }]
    })
    const bottom = placed.reduce((max, node) => Math.max(max, node.y), 0)
    const unplaced = devices
      .filter((device) => doc.layout.devices[device.id] === undefined)
      .map((device, index) => ({ device, x: index * ROW_SPACING, y: bottom + ROW_SPACING }))
    const nodes: SketchNode[] = [...placed, ...unplaced].map(({ device, x, y }) => {
      const address = hostAddress(device)
      return { id: device.id, name: device.name, kind: device.kind, modelId: device.modelId, x, y, ...(address === undefined ? {} : { address }) }
    })
    const at = new Map(nodes.map((node) => [node.id, node]))
    const sketchLinks = links.flatMap((link): SketchLink[] => {
      const a = at.get(link.a.deviceId)
      const b = at.get(link.b.deviceId)
      if (!a || !b) return []
      return [{ id: link.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, connected: link.connected, wireless: link.cable === 'wireless' }]
    })
    const zones = doc.annotations.flatMap((annotation): SketchZone[] =>
      annotation.type === 'rectangle' || annotation.type === 'ellipse'
        ? [
            {
              id: annotation.id,
              x: annotation.at.x,
              y: annotation.at.y,
              width: annotation.width,
              height: annotation.height,
              ellipse: annotation.type === 'ellipse',
              color: annotation.color,
              ...(annotation.label === undefined ? {} : { label: annotation.label }),
            },
          ]
        : [],
    )
    const notes = doc.annotations.flatMap((annotation): SketchNote[] => {
      if (annotation.type !== 'text' || annotation.text.trim() === '') return []
      const fontSize = NOTE_FONT_SIZE[annotation.size]
      const lines = annotation.text.split('\n')
      const longest = Math.max(...lines.map((line) => line.length))
      return [
        {
          id: annotation.id,
          x: annotation.at.x,
          y: annotation.at.y,
          width: Math.ceil(longest * fontSize * NOTE_GLYPH_WIDTH) + 2 * NOTE_PADDING,
          height: Math.ceil(lines.length * fontSize * NOTE_LINE_HEIGHT) + 2 * NOTE_PADDING,
          fontSize,
          lines,
          color: annotation.color,
        },
      ]
    })
    const boxes = [...zones, ...notes]
    const xs = [...nodes.map((node) => node.x), ...boxes.flatMap((box) => [box.x, box.x + box.width])]
    const ys = [...nodes.map((node) => node.y), ...boxes.flatMap((box) => [box.y, box.y + box.height])]
    const minX = Math.min(...xs) - MARGIN
    const minY = Math.min(...ys) - MARGIN
    return {
      viewBox: { x: minX, y: minY, width: Math.max(...xs) + MARGIN - minX, height: Math.max(...ys) + MARGIN - minY },
      zones,
      links: sketchLinks,
      nodes,
      notes,
    }
  }
}
