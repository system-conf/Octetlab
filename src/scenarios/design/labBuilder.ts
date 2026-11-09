// Builds the labs of the design briefs (docs/DESIGN_EXERCISES.md §6.1): devices from catalog models
// with deterministic MACs, cables, canvas positions and zone annotations. A brief builds its starting
// lab and its reference design from the same seed and the same customer devices first, so the
// customer devices keep their ids and MACs in both labs.
import type {
  Annotation,
  AnnotationColor,
  CanvasPoint,
  DesignLab,
  Device,
  ExerciseLock,
  Link,
  NetworkState,
  PlainCableType,
} from '../../domain'
// Deep imports, not the '../../catalog' barrel: samples use this builder and the MCP Worker (mcp/)
// bundles samples, so it must not pull the barrel's React icon components.
import { SeededBaseMacSource } from '../../catalog/BaseMacSource'
import { findDeviceModel } from '../../catalog/DeviceCatalog'
import { PortFactory } from '../../catalog/PortFactory'
import type { DeviceChange } from './deviceSetup'

/** One end of a cable: [device id, port id]. */
export type PortRef = readonly [deviceId: string, portId: string]

export class LabBuilder {
  private readonly ports: PortFactory
  private devices: Device[] = []
  private readonly links: Link[] = []
  private readonly positions: Record<string, CanvasPoint> = {}
  private readonly annotations: Annotation[] = []

  constructor(seed: number) {
    this.ports = new PortFactory(new SeededBaseMacSource(seed))
  }

  /** A device of catalog model `modelId`; its name is the id (a placeholder localized by the brief texts). */
  add(modelId: string, id: string, at: CanvasPoint, ...changes: DeviceChange[]): this {
    const model = findDeviceModel(modelId)
    if (!model) throw new Error(`Design brief uses unknown model ${modelId}`)
    if (this.devices.some((device) => device.id === id)) throw new Error(`Duplicate device id ${id}`)
    this.devices.push(changes.reduce((device, change) => change(device), this.ports.createDevice(model, id, id)))
    this.positions[id] = at
    return this
  }

  /** Several devices of one model in a row, `step` apart horizontally. */
  addRow(modelId: string, ids: readonly string[], at: CanvasPoint, step: number, ...changes: DeviceChange[]): this {
    ids.forEach((id, index) => this.add(modelId, id, { x: at.x + index * step, y: at.y }, ...changes))
    return this
  }

  edit(id: string, ...changes: DeviceChange[]): this {
    if (!this.devices.some((device) => device.id === id)) throw new Error(`No device ${id}`)
    this.devices = this.devices.map((device) => (device.id === id ? changes.reduce((current, change) => change(current), device) : device))
    return this
  }

  cable(id: string, a: PortRef, b: PortRef, cable: PlainCableType = 'copperStraight'): this {
    this.links.push({ id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, cable })
    return this
  }

  /** Wi-Fi association of a client's wlan0 with a radio, on `ssid`. */
  wireless(id: string, clientId: string, radioDeviceId: string, ssid: string): this {
    this.links.push({
      id,
      a: { deviceId: clientId, portId: 'wlan0' },
      b: { deviceId: radioDeviceId, portId: 'Radio0' },
      connected: true,
      cable: 'wireless',
      ssid,
    })
    return this
  }

  /** A building / room zone; its label is the id (localized from `designBriefs:<briefId>.zones.<id>`). */
  zone(id: string, at: CanvasPoint, size: { width: number; height: number }, color: AnnotationColor): this {
    this.annotations.push({ id, type: 'rectangle', at, width: size.width, height: size.height, label: id, filled: true, color })
    return this
  }

  state(): NetworkState {
    return { devices: [...this.devices], links: [...this.links] }
  }

  build(): DesignLab {
    return { state: this.state(), layout: { devices: { ...this.positions } }, annotations: [...this.annotations] }
  }
}

/**
 * Locks of a brief's starting lab: every customer device is pinned (cannot be deleted) and stays
 * powered; the ISP cloud's service lines cannot be switched off; the given provider links stay plugged.
 */
export function customerLocks(start: NetworkState): ExerciseLock[] {
  return [
    ...start.devices.flatMap((device): ExerciseLock[] => [
      { scope: 'placement', deviceId: device.id },
      { scope: 'section', deviceId: device.id, section: 'power', access: 'readOnly' },
      ...(device.kind === 'internet' ? [{ scope: 'section', deviceId: device.id, section: 'internet', access: 'readOnly' } as const] : []),
    ]),
    ...start.links.map((link): ExerciseLock => ({ scope: 'link', linkId: link.id })),
  ]
}
