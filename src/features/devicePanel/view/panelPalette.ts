// Colours of the two front-panel looks (approved mockup: "A — classic" and "B — realistic"). The
// housing is a product colour and stays the same in light and dark mode; the area around it follows
// the app's colour tokens. The map's "simple" style uses the classic panel.
import type { DeviceStyle } from '../../../preferences'
import type { ChassisTone } from '../model/panelTypes'

export type PanelLook = 'classic' | 'realistic'

export interface ChassisColors {
  /** Front gradient, top → bottom. */
  front: readonly [string, string]
  /** Rack ear gradient, left → right. */
  ear: readonly [string, string]
  outline: string
  screw: string
  /** Large print (model code, port ids). */
  text: string
  /** Small print (brand, numbers, captions). */
  sub: string
  /** Console print. */
  accent: string
  radius: number
}

export interface PanelPalette {
  look: PanelLook
  /** Rounded, flat shapes (classic) vs. sharp, detailed ones with glow and brushed metal (realistic). */
  round: boolean
  chassis: Readonly<Record<ChassisTone, ChassisColors>>
  socket: { fill: string; stroke: string; pins: string; bezel: string | null }
  console: { fill: string; stroke: string; ring: string }
  led: { off: string; offStroke: string; up: string; stroke: string }
  vent: string
  powerButton: { fill: string; stroke: string; symbolOn: string; symbolOff: string }
}

const classicBlue: ChassisColors = {
  front: ['#4a9be3', '#2272b8'],
  ear: ['#2b7cc4', '#1a5f9e'],
  outline: '#0d3d66',
  screw: '#0d3d66',
  text: '#ffffff',
  sub: '#cfe8fc',
  accent: '#bae6fd',
  radius: 7,
}

const CLASSIC: PanelPalette = {
  look: 'classic',
  round: true,
  chassis: {
    router: classicBlue,
    switch: classicBlue,
    desktop: { ...classicBlue, front: ['#5aa7e8', '#2a7cc2'], radius: 12 },
    endDevice: { front: ['#ece8dc', '#cfc8b6'], ear: ['#ece8dc', '#cfc8b6'], outline: '#8a8270', screw: '#8a8270', text: '#1f2937', sub: '#5b5446', accent: '#0369a1', radius: 8 },
    provider: { front: ['#f8fbff', '#bfdbfe'], ear: ['#dbeafe', '#93c5fd'], outline: '#3b82f6', screw: '#3b82f6', text: '#0c4a6e', sub: '#1e40af', accent: '#0369a1', radius: 10 },
  },
  socket: { fill: '#0f3457', stroke: '#9fd0f7', pins: '#7fb8ea', bezel: null },
  console: { fill: '#0f3457', stroke: '#7dd3fc', ring: '#38bdf8' },
  led: { off: '#174a78', offStroke: '#6cb4f0', up: '#4ade80', stroke: '#0d3d66' },
  vent: 'rgba(255,255,255,.16)',
  powerButton: { fill: '#0f3457', stroke: '#9fd0f7', symbolOn: '#bae6fd', symbolOff: '#5b7d99' },
}

const REALISTIC: PanelPalette = {
  look: 'realistic',
  round: false,
  chassis: {
    router: { front: ['#2c313a', '#121418'], ear: ['#e5e7eb', '#9ca3af'], outline: '#64748b', screw: '#374151', text: '#f3f4f6', sub: '#9ca3af', accent: '#60a5fa', radius: 3 },
    switch: { front: ['#f3f4f7', '#bfc5ce'], ear: ['#d1d5db', '#8b929c'], outline: '#6b7280', screw: '#374151', text: '#1f2937', sub: '#4b5563', accent: '#1d4ed8', radius: 3 },
    desktop: { front: ['#fafafa', '#d4d7dc'], ear: ['#e5e7eb', '#9ca3af'], outline: '#9ca3af', screw: '#374151', text: '#1f2937', sub: '#4b5563', accent: '#1d4ed8', radius: 10 },
    endDevice: { front: ['#3a404b', '#1b1f26'], ear: ['#3a404b', '#1b1f26'], outline: '#64748b', screw: '#374151', text: '#f3f4f6', sub: '#9ca3af', accent: '#60a5fa', radius: 6 },
    provider: { front: ['#e5e7eb', '#a8b0bb'], ear: ['#d1d5db', '#8b929c'], outline: '#6b7280', screw: '#374151', text: '#111827', sub: '#374151', accent: '#1d4ed8', radius: 6 },
  },
  socket: { fill: '#05070a', stroke: '#2a2f37', pins: '#d4a72c', bezel: '#8b929c' },
  console: { fill: '#0b1220', stroke: '#1e3a8a', ring: '#3b82f6' },
  led: { off: '#2a2e35', offStroke: '#474d57', up: '#4ade80', stroke: '#14532d' },
  vent: 'rgba(0,0,0,.45)',
  powerButton: { fill: '#0b0d10', stroke: '#4b5563', symbolOn: '#4ade80', symbolOff: '#6b7280' },
}

/** Front-panel look for the map's device style (simple → classic). */
export function panelPaletteFor(style: DeviceStyle): PanelPalette {
  return style === 'realistic' ? REALISTIC : CLASSIC
}
