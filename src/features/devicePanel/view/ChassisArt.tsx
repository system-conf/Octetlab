import type { KeyboardEvent } from 'react'
import type { FrontPanelPlan } from '../model/panelTypes'
import type { ChassisColors, PanelPalette } from './panelPalette'
import { PanelLed } from './SocketArt'

export const PANEL_FONT = 'ui-sans-serif, system-ui, sans-serif'

/** Hover / keyboard focus ring of a clickable part of the panel (its `<g>` carries `group`). */
export const HIT_CLASS = 'fill-transparent stroke-transparent group-hover:fill-sky-400/10 group-focus-visible:stroke-focus group-focus-visible:fill-sky-400/15'

/** SVG text squeezing mode for long model names. */
const SQUEEZE = 'spacingAndGlyphs'

/** Brand printed on every generated panel (a product name, not translated). */
const BRAND = 'OCTET'

/** Element ids of the panel's gradients and filters, unique per rendered panel. */
export interface PanelDefIds {
  front: string
  ear: string
  brushed: string
  glow: string
}

export function PanelDefs({ ids, colors }: { ids: PanelDefIds; colors: ChassisColors }) {
  return (
    <defs>
      <linearGradient id={ids.front} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={colors.front[0]} />
        <stop offset="1" stopColor={colors.front[1]} />
      </linearGradient>
      <linearGradient id={ids.ear} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={colors.ear[0]} />
        <stop offset="1" stopColor={colors.ear[1]} />
      </linearGradient>
      <pattern id={ids.brushed} width="6" height="3" patternUnits="userSpaceOnUse">
        <rect width="6" height="1" fill="#fff" opacity={0.05} />
        <rect y="2" width="3" height="0.6" fill="#000" opacity={0.05} />
      </pattern>
      <filter id={ids.glow} x="-1" y="-1" width="3" height="3">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  )
}

/** Housing: rack ears, antennas, the front plate with its sheen and the ventilation slots. */
export function ChassisBody({ plan, palette, colors, ids }: { plan: FrontPanelPlan; palette: PanelPalette; colors: ChassisColors; ids: PanelDefIds }) {
  const { body, width, height } = plan
  const earXs = plan.ears ? [0, width - 24] : []
  return (
    <g>
      {plan.antennas.map((antenna) => (
        <g key={antenna.x}>
          <rect x={antenna.x - 3} y={antenna.y - 28} width={6} height={30} rx={3} fill={palette.round ? '#1f4f7a' : '#1f2329'} stroke={colors.outline} strokeWidth={0.6} />
          <rect x={antenna.x - 4.5} y={antenna.y - 3} width={9} height={5} rx={1.5} fill={palette.round ? '#0d3d66' : '#4b5563'} />
        </g>
      ))}
      {earXs.map((ex) => (
        <g key={ex}>
          <rect x={ex} y={4} width={24} height={height - 8} rx={3} fill={`url(#${ids.ear})`} stroke={colors.outline} strokeWidth={0.8} />
          {[18, height - 18].map((sy) =>
            palette.round ? (
              <ellipse key={sy} cx={ex + 12} cy={sy} rx={5} ry={3.4} fill={colors.screw} opacity={0.55} />
            ) : (
              <g key={sy}>
                <ellipse cx={ex + 12} cy={sy} rx={5.2} ry={3.6} fill="#1f2329" stroke="#6b7280" strokeWidth={0.5} />
                <circle cx={ex + 12} cy={sy} r={2.4} fill="#c7ccd3" />
                <path d={`M${ex + 10.4} ${sy}h3.2`} stroke="#4b5563" strokeWidth={0.8} />
              </g>
            ),
          )}
        </g>
      ))}
      <rect x={body.x} y={body.y} width={body.w} height={body.h} rx={colors.radius} fill={`url(#${ids.front})`} stroke={colors.outline} strokeWidth={1.2} />
      {palette.round ? (
        <path d={`M${body.x + 7} ${body.y + 3}H${body.x + body.w - 7}`} stroke="#fff" strokeOpacity={0.35} strokeWidth={1.4} strokeLinecap="round" />
      ) : (
        <>
          <rect x={body.x} y={body.y} width={body.w} height={body.h} rx={colors.radius} fill={`url(#${ids.brushed})`} />
          <path d={`M${body.x + 3} ${body.y + 1.4}H${body.x + body.w - 3}`} stroke="#fff" strokeOpacity={0.28} />
        </>
      )}
      {plan.vents && <Vents vents={plan.vents} palette={palette} />}
    </g>
  )
}

function Vents({ vents, palette }: { vents: NonNullable<FrontPanelPlan['vents']>; palette: PanelPalette }) {
  const slots: { x: number; y: number }[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let vx = vents.x1 + (row % 2) * 7; vx < vents.x2 - 10; vx += 14) slots.push({ x: vx, y: vents.cy - 14 + row * 9 })
  }
  return (
    <g aria-hidden="true">
      {slots.map(({ x, y }) =>
        palette.round ? (
          <path key={`${x}-${y}`} d={`M${x} ${y}h8`} stroke={palette.vent} strokeWidth={3} strokeLinecap="round" />
        ) : (
          <rect key={`${x}-${y}`} x={x} y={y - 2} width={9} height={4} rx={2} fill={palette.vent} />
        ),
      )}
    </g>
  )
}

interface BrandProps {
  plan: FrontPanelPlan
  palette: PanelPalette
  colors: ChassisColors
  glowId: string
  /** Translated model name, printed small under the code. */
  modelName: string
  powerLabel: string
  powered: boolean
}

/** OCTET brand, model code and name, and the power light. */
export function BrandBlock({ plan, palette, colors, glowId, modelName, powerLabel, powered }: BrandProps) {
  const { brand, power } = plan
  const compact = brand.compact
  // Room for the name: up to the power button (side by side) or up to the first port (stacked).
  const nameWidth = compact ? 104 : 93
  const nameSize = compact ? 7 : 8
  // Long names are squeezed to fit instead of running into the ports.
  const squeeze = modelName.length * nameSize * 0.56 > nameWidth
  return (
    <g fontFamily={PANEL_FONT} pointerEvents="none">
      <text x={brand.x} y={brand.y} fontSize={7.5} fontWeight={700} fill={colors.sub} letterSpacing={1.6}>
        {BRAND}
      </text>
      <text x={brand.x} y={brand.y + (compact ? 18 : 20)} fontSize={compact ? 15 : 18} fontWeight={700} fill={colors.text}>
        {brand.code}
      </text>
      <text
        x={brand.x}
        y={brand.y + (compact ? 30 : 33)}
        fontSize={nameSize}
        fontWeight={500}
        fill={colors.sub}
        {...(squeeze ? { textLength: nameWidth, lengthAdjust: SQUEEZE } : {})}
      >
        {modelName}
      </text>
      <PanelLed x={power.led.x} y={power.led.y} lit={powered} palette={palette} glowId={glowId} />
      <text x={power.led.x + 8} y={power.led.y + 3} fontSize={7} fontWeight={600} fill={colors.sub} letterSpacing={0.5}>
        {powerLabel}
      </text>
    </g>
  )
}

interface PowerButtonProps {
  plan: FrontPanelPlan
  palette: PanelPalette
  colors: ChassisColors
  powered: boolean
  label: string
  caption: string
  /** Absent: the exercise locks the power switch. */
  onToggle?: () => void
}

/** Round power switch; pressing it turns the device on or off like the Settings tab's power button. */
export function PowerButton({ plan, palette, colors, powered, label, caption, onToggle }: PowerButtonProps) {
  const { x, y, r } = plan.power.button
  const { powerButton } = palette
  const s = r / 10.5
  function handleKey(event: KeyboardEvent<SVGGElement>) {
    if (!onToggle || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onToggle()
  }
  return (
    <g
      role="button"
      aria-label={label}
      aria-pressed={powered}
      aria-disabled={onToggle ? undefined : true}
      tabIndex={onToggle ? 0 : -1}
      onClick={onToggle}
      onKeyDown={handleKey}
      className={`group outline-none ${onToggle ? 'cursor-pointer' : 'cursor-not-allowed'}`}
    >
      <title>{label}</title>
      <circle cx={x} cy={y} r={r + 3} strokeWidth={1.6} className={HIT_CLASS} />
      <circle cx={x} cy={y} r={r} fill={powerButton.fill} stroke={powerButton.stroke} strokeWidth={1.2} />
      <path
        d={`M${x - 3.6 * s} ${y - 3.2 * s}A${5 * s} ${5 * s} 0 1 0 ${x + 3.6 * s} ${y - 3.2 * s}M${x} ${y - 5.6 * s}V${y - 0.6 * s}`}
        fill="none"
        stroke={powered ? powerButton.symbolOn : powerButton.symbolOff}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <text x={x} y={y + r + 10} textAnchor="middle" fontFamily={PANEL_FONT} fontSize={6.5} fontWeight={600} fill={colors.sub} letterSpacing={0.5}>
        {caption}
      </text>
    </g>
  )
}
