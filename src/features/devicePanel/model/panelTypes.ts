// Geometry of a generated device front panel (FrontPanelLayout), in SVG viewBox units.
import type { PortStripGroup } from '../../../catalog'

/**
 * Housing of the device:
 * - `rack`: 1U box with rack ears (routers, managed switches, L3 switches)
 * - `desktop`: small box on the desk, antennas when it has a radio (desktop switch, hub, home router, modem, AP)
 * - `endDevice`: the network side of a PC, laptop, printer, phone… (its NICs only)
 * - `provider`: the internet provider's handoff box (the cloud device)
 */
export type ChassisKind = 'rack' | 'desktop' | 'endDevice' | 'provider'

/** Colour family of the housing (PanelPalette). */
export type ChassisTone = 'router' | 'switch' | 'desktop' | 'endDevice' | 'provider'

export type SocketShape = 'rj45' | 'sfp' | 'serial' | 'console'

export interface Point {
  x: number
  y: number
}

/** One cable socket on the face. */
export interface PanelSocket {
  portId: string
  shape: SocketShape
  x: number
  y: number
  w: number
  h: number
  /** Latch notch on top: the bottom row of a staggered pair is mounted upside down. */
  flipped: boolean
  /** Text printed next to the socket ('Gi0/1', or '13' in a staggered row). */
  label: string
  labelAt: Point
  /** Smaller print (staggered rows, uplinks). */
  smallLabel: boolean
  /** Link light; null = the socket has none (console). */
  led: Point | null
}

/** A radio or Wi-Fi NIC: drawn as a Wi-Fi mark with a light, not as a socket. */
export interface PanelRadio {
  portId: string
  /** Centre of the Wi-Fi mark. */
  x: number
  y: number
  label: string
  labelAt: Point
  led: Point
}

/** Printed bracket under a single-row group of sockets, e.g. 'LAN'. */
export interface PanelCaption {
  group: PortStripGroup
  x1: number
  x2: number
  /** Baseline of the bracket line. */
  y: number
}

export interface PanelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PanelBrand {
  x: number
  /** Baseline of the small 'OCTET' line; the model code and name follow below it. */
  y: number
  /** Short model code printed large, e.g. 'S24-FE'. */
  code: string
  /** Stacked layout of the staggered (two-row) panels. */
  compact: boolean
}

export interface PanelPower {
  button: Point & { r: number }
  /** Power light and its print. */
  led: Point
}

/** Everything needed to draw one front panel. */
export interface FrontPanelPlan {
  chassis: ChassisKind
  tone: ChassisTone
  width: number
  height: number
  body: PanelRect
  /** Rack ears left and right of the body. */
  ears: boolean
  /** Antennas above the body (desktop boxes with a radio). */
  antennas: readonly Point[]
  brand: PanelBrand
  power: PanelPower
  sockets: readonly PanelSocket[]
  radios: readonly PanelRadio[]
  captions: readonly PanelCaption[]
  /** Ventilation slots between the last port group and the console; null when there is no room. */
  vents: { x1: number; x2: number; cy: number } | null
  /** Ports left to right (sockets and radios), for keyboard navigation. */
  order: readonly string[]
  /** Smallest on-screen width (CSS px) at which the sockets stay readable; narrower areas scroll. */
  minDisplayWidth: number
}
