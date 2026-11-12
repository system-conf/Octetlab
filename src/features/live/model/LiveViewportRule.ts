// Live labs: when the watched map may move by itself. The viewer's pan and zoom are kept; the map is
// fitted again only when the first devices appear, or when a new device lands outside the view.
import type { LabDocument } from '../../../domain'

/** The visible part of the map, in flow coordinates. */
export interface FlowRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

/** A device's icon box plus the name label under it (flow px; the label is wider than the icon). */
const DEVICE_BOX = { left: -40, top: 0, right: 88, bottom: 80 }

export class LiveViewportRule {
  /** Flow rectangle the canvas shows for a viewport; null while the canvas has no size yet. */
  static visibleRect(viewport: FlowViewport, width: number, height: number): FlowRect | null {
    if (width <= 0 || height <= 0 || viewport.zoom <= 0) return null
    return { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: width / viewport.zoom, height: height / viewport.zoom }
  }

  /**
   * Whether `next` should be fitted into view after `previous` was shown. The first document is
   * fitted by the workspace itself (previous = null → false).
   */
  static shouldRefit(previous: LabDocument | null, next: LabDocument, visible: FlowRect | null): boolean {
    if (previous === null) return false
    const known = new Set(previous.state.devices.map((device) => device.id))
    const added = next.state.devices.filter((device) => !known.has(device.id))
    if (added.length === 0) return false
    if (previous.state.devices.length === 0 || visible === null) return true
    return added.some((device) => {
      const at = next.layout.devices[device.id]
      return at === undefined || !LiveViewportRule.contains(visible, at.x, at.y)
    })
  }

  private static contains(rect: FlowRect, x: number, y: number): boolean {
    return (
      x + DEVICE_BOX.left >= rect.x &&
      y + DEVICE_BOX.top >= rect.y &&
      x + DEVICE_BOX.right <= rect.x + rect.width &&
      y + DEVICE_BOX.bottom <= rect.y + rect.height
    )
  }
}
