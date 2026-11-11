import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PortPanelState } from '../model/PortPanelStatus'
import type { FrontPanelPlan } from '../model/panelTypes'
import { BrandBlock, ChassisBody, HIT_CLASS, PANEL_FONT, PanelDefs, PowerButton, type PanelDefIds } from './ChassisArt'
import type { PanelPalette } from './panelPalette'
import { PanelLed, SocketArt, WifiMark } from './SocketArt'

export interface FrontPanelSvgProps {
  plan: FrontPanelPlan
  palette: PanelPalette
  states: ReadonlyMap<string, PortPanelState>
  powered: boolean
  /** Translated model name printed under the model code. */
  modelName: string
  /** Accessible name of the whole panel. */
  label: string
  /** Port shown highlighted (hovered, focused, pinned or hovered in the table). */
  hotPortId: string | null
  pinnedPortId: string | null
  describe: (portId: string) => string
  onHover: (portId: string | null) => void
  onPin: (portId: string) => void
  /** Absent: the power switch is locked by the exercise. */
  onTogglePower?: () => void
}

const HOT_CLASS = 'fill-sky-400/15 stroke-focus'

/** The generated front panel as one scalable SVG: housing, brand, power switch, sockets with plugs and lights. */
function FrontPanelSvg(props: FrontPanelSvgProps) {
  const { plan, palette, states, powered, hotPortId } = props
  const { t } = useTranslation(['device', 'catalog'])
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ids: PanelDefIds = { front: `${uid}f`, ear: `${uid}e`, brushed: `${uid}b`, glow: `${uid}g` }
  const colors = palette.chassis[plan.tone]
  const portRefs = useRef(new Map<string, SVGGElement>())

  function handlePortKey(event: KeyboardEvent<SVGGElement>, portId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      props.onPin(portId)
      return
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const index = plan.order.indexOf(portId)
    const next = plan.order[(index + step + plan.order.length) % plan.order.length]
    if (next !== undefined) portRefs.current.get(next)?.focus()
  }

  function portGroup(portId: string, children: ReactNode) {
    return (
      <g
        key={portId}
        ref={(element) => {
          if (element) portRefs.current.set(portId, element)
          else portRefs.current.delete(portId)
        }}
        role="button"
        tabIndex={0}
        aria-label={props.describe(portId)}
        aria-pressed={props.pinnedPortId === portId}
        data-port={portId}
        className="group cursor-pointer outline-none"
        onMouseEnter={() => props.onHover(portId)}
        onFocus={() => props.onHover(portId)}
        onClick={() => props.onPin(portId)}
        onKeyDown={(event) => handlePortKey(event, portId)}
      >
        {children}
      </g>
    )
  }

  const text = (x: number, y: number, size: number, value: string, fill: string) => (
    <text x={x} y={y} textAnchor="middle" fontFamily={PANEL_FONT} fontSize={size} fontWeight={600} fill={fill} pointerEvents="none">
      {value}
    </text>
  )

  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      role="group"
      aria-label={props.label}
      className="block h-auto w-full overflow-visible"
      onMouseLeave={() => props.onHover(null)}
      data-panel-look={palette.look}
    >
      <PanelDefs ids={ids} colors={colors} />
      <ChassisBody plan={plan} palette={palette} colors={colors} ids={ids} />
      <BrandBlock plan={plan} palette={palette} colors={colors} glowId={ids.glow} modelName={props.modelName} powerLabel={t('physical.print.power')} powered={powered} />
      <PowerButton
        plan={plan}
        palette={palette}
        colors={colors}
        powered={powered}
        label={props.onTogglePower ? (powered ? t('physical.powerButton.turnOff') : t('physical.powerButton.turnOn')) : t('physical.powerButton.locked')}
        caption={t('physical.print.powerButton')}
        onToggle={props.onTogglePower}
      />
      {plan.captions.map((caption) => (
        <g key={`${caption.group}-${caption.x1}`} pointerEvents="none">
          <path d={`M${caption.x1} ${caption.y - 3}V${caption.y}H${caption.x2}V${caption.y - 3}`} fill="none" stroke={colors.sub} strokeWidth={0.8} opacity={0.7} />
          {text((caption.x1 + caption.x2) / 2, caption.y + 7.5, 6.5, t(`catalog:portGroups.${caption.group}.name`).toLocaleUpperCase(), colors.sub)}
        </g>
      ))}
      {plan.sockets.map((socket) => {
        const state = states.get(socket.portId)
        const hot = hotPortId === socket.portId
        const consoleSocket = socket.shape === 'console'
        return portGroup(
          socket.portId,
          <>
            <SocketArt socket={socket} plug={state?.plug ?? null} palette={palette} />
            {consoleSocket
              ? text(socket.labelAt.x, socket.labelAt.y, 7, t('physical.print.console'), colors.accent)
              : text(socket.labelAt.x, socket.labelAt.y, socket.smallLabel ? 7 : 8.5, socket.label, socket.smallLabel ? colors.sub : colors.text)}
            {socket.led && <PanelLed x={socket.led.x} y={socket.led.y} lit={state?.lit ?? false} palette={palette} glowId={ids.glow} />}
            <rect x={socket.x - 4} y={socket.y - 4} width={socket.w + 8} height={socket.h + 8} rx={4} strokeWidth={1.6} className={hot ? HOT_CLASS : HIT_CLASS} />
          </>,
        )
      })}
      {plan.radios.map((radio) => {
        const state = states.get(radio.portId)
        const hot = hotPortId === radio.portId
        return portGroup(
          radio.portId,
          <>
            <WifiMark x={radio.x} y={radio.y} active={state?.lit ?? false} palette={palette} colour={colors.text} />
            {text(radio.labelAt.x, radio.labelAt.y, 7, radio.label, colors.sub)}
            <PanelLed x={radio.led.x} y={radio.led.y} lit={state?.lit ?? false} palette={palette} glowId={ids.glow} />
            <rect x={radio.x - 16} y={radio.labelAt.y - 8} width={32} height={radio.led.y - radio.labelAt.y + 13} rx={4} strokeWidth={1.6} className={hot ? HOT_CLASS : HIT_CLASS} />
          </>,
        )
      })}
    </svg>
  )
}

export default FrontPanelSvg
