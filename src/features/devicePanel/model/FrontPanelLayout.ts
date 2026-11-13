// Generates the front panel of a device from its own ports (Device.ports is authoritative) and the
// strip groups of its catalog model: housing, port rows, labels, lights and the brand block. Pure
// geometry in viewBox units; colours and shapes are drawn by the view (FrontPanelSvg).
import { PortStrip, type PortStripGroup } from '../../../catalog'
import type { Device, DeviceModel, Port } from '../../../domain'
import { ModelCode } from './ModelCode'
import type { ChassisKind, ChassisTone, FrontPanelPlan, PanelCaption, PanelRadio, PanelSocket, Point, SocketShape } from './panelTypes'

interface SocketSize {
  w: number
  h: number
  step: number
}

/** Single-row socket sizes per shape; uplinks use the smaller copper size. */
const MAIN: SocketSize = { w: 34, h: 28, step: 52 }
const SMALL: SocketSize = { w: 26, h: 22, step: 32 }
const SFP: SocketSize = { w: 30, h: 16, step: 38 }
const SERIAL: SocketSize = { w: 42, h: 20, step: 56 }
const CONSOLE = { w: 28, h: 22 }
/** Staggered two-row block: odd ports on top, even ports below, a gap after every 6 columns. */
const STAGGER = { w: 24, h: 20, step: 28, blockColumns: 6, blockGap: 10, rowGap: 5 }
/** Sections with more copper ports than this use the staggered two-row block. */
export const STAGGER_THRESHOLD = 8
const GROUP_GAP = 18
const RADIO_STEP = 44
const EAR_WIDTH = 24
const ANTENNA_ROOM = 30
/** Smallest readable socket width on screen (CSS px). */
const MIN_SOCKET_PX = 14
const MIN_WIDTH: Readonly<Record<ChassisKind, number>> = { rack: 500, desktop: 400, endDevice: 300, provider: 400 }

interface Section {
  group: PortStripGroup
  ports: Port[]
}

export class FrontPanelLayout {
  /** Front panel of `device`; `model` (its catalog model) only supplies the port groups. */
  static plan(device: Device, model: DeviceModel | undefined): FrontPanelPlan {
    return new FrontPanelLayout(device, model).build()
  }

  /** Housing of a device: see ChassisKind. Managed switches have a console and sit in the rack. */
  static chassisOf(device: Device): ChassisKind {
    switch (device.kind) {
      case 'router':
      case 'l3Switch':
      case 'firewall':
        return 'rack'
      case 'switch':
        return device.ports.some((port) => port.medium === 'console') ? 'rack' : 'desktop'
      case 'hub':
      case 'wirelessRouter':
      case 'accessPoint':
        return 'desktop'
      case 'internet':
        return 'provider'
      default:
        return 'endDevice'
    }
  }

  private readonly device: Device
  private readonly model: DeviceModel | undefined
  private readonly chassis: ChassisKind
  private readonly sockets: PanelSocket[] = []
  private readonly radios: PanelRadio[] = []
  private readonly captions: PanelCaption[] = []

  private constructor(device: Device, model: DeviceModel | undefined) {
    this.device = device
    this.model = model
    this.chassis = FrontPanelLayout.chassisOf(device)
  }

  private build(): FrontPanelPlan {
    const sections = this.sections()
    const staggered = sections.some((section) => FrontPanelLayout.isStaggered(section))
    const hasRadio = this.device.ports.some((port) => port.medium === 'wireless')
    const ears = this.chassis === 'rack'
    const top = this.chassis === 'desktop' && hasRadio ? ANTENNA_ROOM : 0
    const bodyHeight = staggered ? 112 : 92
    const left = ears ? EAR_WIDTH - 3 : 2
    const body = { x: left, y: top + 2, w: 0, h: bodyHeight }
    const cy = body.y + bodyHeight / 2
    const compact = staggered

    // Brand block and power button on the left, then the port groups left to right.
    const brand = { x: left + 15, y: compact ? cy - 31 : cy - 18, code: ModelCode.of(this.device, this.model), compact }
    const power = compact
      ? { button: { x: left + 93, y: cy + 25, r: 8 }, led: { x: left + 19, y: cy + 18 } }
      : { button: { x: left + 125, y: cy, r: 10.5 }, led: { x: left + 19, y: cy + 31 } }
    let x = left + (compact ? 129 : 159)

    for (const section of sections) {
      const placed = section.ports.filter((port) => port.medium !== 'console' && port.medium !== 'wireless')
      if (placed.length === 0) continue
      x = FrontPanelLayout.isStaggered(section) ? this.placeStaggered(placed, x, cy) : this.placeRow(section.group, placed, x, cy, body.y + bodyHeight)
      x += GROUP_GAP
    }
    for (const port of this.device.ports.filter((candidate) => candidate.medium === 'wireless')) {
      this.radios.push(FrontPanelLayout.radioAt(port.id, x, cy))
      x += RADIO_STEP
    }
    const contentEnd = x - GROUP_GAP + 4

    const right = ears ? EAR_WIDTH - 3 : 2
    const consoles = this.device.ports.filter((port) => port.medium === 'console')
    const minWidth = MIN_WIDTH[this.chassis]
    let consoleX: number | null = null
    let width: number
    if (consoles.length > 0) {
      const consoleBlock = consoles.length * (CONSOLE.w + 14) - 14
      consoleX = Math.max(contentEnd + 30, minWidth - right - 18 - consoleBlock)
      width = consoleX + consoleBlock + 18 + right
      consoles.forEach((port, index) => this.placeConsole(port.id, (consoleX ?? 0) + index * (CONSOLE.w + 14), cy, staggered))
    } else {
      width = Math.max(minWidth, contentEnd + 18 + right)
    }
    body.w = width - left - right

    const ventEnd = (consoleX ?? width - right - 10) - 14
    const vents = ventEnd - (contentEnd + 16) > 80 ? { x1: contentEnd + 16, x2: ventEnd, cy } : null
    const antennas: Point[] = top > 0 ? [{ x: body.x + body.w * 0.16, y: body.y }, { x: body.x + body.w * 0.84, y: body.y }] : []
    const placedIds = new Set([...this.sockets.map((socket) => socket.portId), ...this.radios.map((radio) => radio.portId)])
    const smallestSocket = Math.min(...this.sockets.map((socket) => socket.w), MAIN.w)

    return {
      chassis: this.chassis,
      tone: this.tone(),
      width,
      height: body.y + bodyHeight + 2,
      body,
      ears,
      antennas,
      brand,
      power,
      sockets: this.sockets,
      radios: this.radios,
      captions: this.captions,
      vents,
      order: this.device.ports.map((port) => port.id).filter((id) => placedIds.has(id)),
      minDisplayWidth: Math.round((width * MIN_SOCKET_PX) / smallestSocket),
    }
  }

  /** Ports grouped like the catalog's port strip (model order; unknown ports last). */
  private sections(): Section[] {
    const groupOf = new Map<string, PortStripGroup>()
    for (const section of PortStrip.forDevice(this.device, this.model).sections) {
      for (const id of section.rows.flat()) groupOf.set(id, section.group)
    }
    const sections: Section[] = []
    for (const port of this.device.ports) {
      const group = groupOf.get(port.id) ?? 'other'
      const section = sections.find((candidate) => candidate.group === group)
      if (section) section.ports.push(port)
      else sections.push({ group, ports: [port] })
    }
    return sections.sort((first, second) => Number(first.group === 'other') - Number(second.group === 'other'))
  }

  private static isStaggered(section: Section): boolean {
    const copper = section.ports.filter((port) => port.medium === 'copper')
    return copper.length > STAGGER_THRESHOLD && copper.length === section.ports.length
  }

  private tone(): ChassisTone {
    if (this.chassis !== 'rack') return this.chassis
    return this.device.kind === 'router' ? 'router' : 'switch'
  }

  /** Two rows, numbered by the port's last number; returns the x after the block. */
  private placeStaggered(ports: readonly Port[], x: number, cy: number): number {
    const { w, h, step, blockColumns, blockGap, rowGap } = STAGGER
    let end = x
    ports.forEach((port, index) => {
      const column = Math.floor(index / 2)
      const bottom = index % 2 === 1
      const sx = x + column * step + Math.floor(column / blockColumns) * blockGap
      const sy = bottom ? cy + rowGap : cy - h - rowGap
      const centre = sx + w / 2
      this.sockets.push({
        portId: port.id,
        shape: 'rj45',
        x: sx,
        y: sy,
        w,
        h,
        flipped: bottom,
        label: FrontPanelLayout.numberOf(port.id, index + 1),
        labelAt: { x: centre, y: bottom ? sy + h + 19 : sy - 12.5 },
        smallLabel: true,
        led: { x: centre, y: bottom ? sy + h + 6 : sy - 6 },
      })
      end = Math.max(end, sx + w)
    })
    return end
  }

  /** One row of sockets with a printed group bracket below; returns the x after the row. */
  private placeRow(group: PortStripGroup, ports: readonly Port[], x: number, cy: number, bodyBottom: number): number {
    let sx = x
    let end = x
    for (const port of ports) {
      const shape = FrontPanelLayout.shapeOf(port)
      const size = FrontPanelLayout.sizeOf(shape, group, ports.length)
      const raised = size === MAIN ? 2 : 0
      const sy = cy - size.h / 2 + raised
      const centre = sx + size.w / 2
      this.sockets.push({
        portId: port.id,
        shape,
        x: sx,
        y: sy,
        w: size.w,
        h: size.h,
        flipped: false,
        label: FrontPanelLayout.shortLabel(port.id),
        labelAt: { x: centre, y: sy - 7 },
        smallLabel: size !== MAIN,
        led: { x: centre, y: sy + size.h + (size === MAIN ? 7 : 8) },
      })
      end = sx + size.w
      sx += size.step
    }
    this.captions.push({ group, x1: x, x2: end, y: bodyBottom - 12 })
    return end
  }

  private placeConsole(portId: string, x: number, cy: number, staggered: boolean): void {
    const y = cy - CONSOLE.h / 2 + (staggered ? 0 : 2)
    this.sockets.push({
      portId,
      shape: 'console',
      x,
      y,
      w: CONSOLE.w,
      h: CONSOLE.h,
      flipped: false,
      label: portId,
      labelAt: { x: x + CONSOLE.w / 2, y: y - 8 },
      smallLabel: true,
      led: null,
    })
  }

  private static radioAt(portId: string, x: number, cy: number): PanelRadio {
    const centre = x + 14
    return { portId, x: centre, y: cy - 1, label: portId, labelAt: { x: centre, y: cy - 19 }, led: { x: centre, y: cy + 17 } }
  }

  static shapeOf(port: Port): SocketShape {
    switch (port.medium) {
      case 'fiber':
        return 'sfp'
      case 'serial':
        return 'serial'
      case 'console':
        return 'console'
      default:
        return 'rj45'
    }
  }

  private static sizeOf(shape: SocketShape, group: PortStripGroup, count: number): SocketSize {
    if (shape === 'sfp') return SFP
    if (shape === 'serial') return SERIAL
    return group === 'uplink' && count > 1 ? SMALL : MAIN
  }

  /** Print on the face: whole short ids ('Gi0/1', 'eth0', 'LAN1'); long ones keep their last number. */
  static shortLabel(portId: string): string {
    const numbered = /^Port(\d+)$/.exec(portId)
    if (numbered?.[1] !== undefined) return numbered[1]
    return portId.length <= 6 || !portId.includes('/') ? portId : (portId.split('/').pop() ?? portId)
  }

  /** Port number in a staggered block: the id's last number ('Fa0/13' → '13'), else the position. */
  static numberOf(portId: string, position: number): string {
    const match = /(\d+)$/.exec(portId)
    return match?.[1] ?? String(position)
  }
}
