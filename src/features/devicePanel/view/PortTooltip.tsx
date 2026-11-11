import type { PortPanelState } from '../model/PortPanelStatus'
import type { FrontPanelPlan } from '../model/panelTypes'
import type { PortTexts } from './usePortTexts'

interface PortTooltipProps {
  plan: FrontPanelPlan
  port: PortPanelState
  texts: PortTexts
}

const SEPARATOR = '·'

/** Where the tooltip points, in viewBox units: the top centre of the socket (or radio mark) and its print. */
function anchorOf(plan: FrontPanelPlan, portId: string): { x: number; y: number } | null {
  const socket = plan.sockets.find((candidate) => candidate.portId === portId)
  if (socket) return { x: socket.x + socket.w / 2, y: Math.min(socket.y, socket.labelAt.y - 8) - 2 }
  const radio = plan.radios.find((candidate) => candidate.portId === portId)
  return radio ? { x: radio.x, y: radio.labelAt.y - 10 } : null
}

/**
 * Dark bubble above the highlighted port: 'Gi0/1 · 192.168.10.1/24 · Staff Switch Fa0/8 · Up'.
 * Positioned in percent of the panel so it follows the SVG's scaling; near the panel's ends it is
 * shifted inwards instead of being cut off. Screen readers get the same text from the port's label.
 */
function PortTooltip({ plan, port, texts }: PortTooltipProps) {
  const anchor = anchorOf(plan, port.portId)
  if (!anchor) return null
  const xRatio = anchor.x / plan.width
  const shift = xRatio < 0.2 ? '-12%' : xRatio > 0.8 ? '-88%' : '-50%'
  const parts = [texts.detail, texts.peer].filter((part) => part !== '')
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 w-max max-w-80 rounded-lg bg-fg-strong px-2.5 py-1.5 text-xs text-page shadow-lg"
      style={{ left: `${xRatio * 100}%`, top: `${(anchor.y / plan.height) * 100}%`, transform: `translate(${shift}, calc(-100% - 6px))` }}
    >
      <b className="font-mono font-semibold" dir="ltr">
        {port.portId}
      </b>
      {parts.map((part) => (
        <span key={part}>
          <span className="mx-1.5 opacity-50">{SEPARATOR}</span>
          <span dir="auto">{part}</span>
        </span>
      ))}
      <span className="mx-1.5 opacity-50">{SEPARATOR}</span>
      <span className={port.lit ? 'font-semibold text-emerald-300 dark:text-emerald-700' : 'opacity-75'}>{texts.condition}</span>
    </div>
  )
}

export default PortTooltip
