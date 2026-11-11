import { CABLE_STYLE } from '../../shared/cableStyle'
import type { PortPanelState } from '../model/PortPanelStatus'
import type { PanelSocket, Point } from '../model/panelTypes'
import type { PanelPalette } from './panelPalette'

interface LedProps extends Point {
  lit: boolean
  palette: PanelPalette
  /** id of the glow filter (realistic look). */
  glowId: string
}

/** Link or power light: a round lamp (classic) or a glowing light pipe (realistic). */
export function PanelLed({ x, y, lit, palette, glowId }: LedProps) {
  const { led } = palette
  if (palette.round) {
    return lit ? (
      <g>
        <circle cx={x} cy={y} r={3.1} fill={led.up} stroke={led.stroke} strokeWidth={0.8} />
        <circle cx={x - 0.9} cy={y - 0.9} r={0.9} fill="#fff" opacity={0.7} />
      </g>
    ) : (
      <circle cx={x} cy={y} r={3} fill={led.off} stroke={led.offStroke} strokeWidth={0.8} />
    )
  }
  return lit ? (
    <g>
      <rect x={x - 5} y={y - 3.5} width={10} height={7} rx={2} fill={led.up} filter={`url(#${glowId})`} opacity={0.9} />
      <rect x={x - 3.2} y={y - 1.7} width={6.4} height={3.4} rx={1} fill={led.up} />
      <rect x={x - 2.4} y={y - 1.3} width={3} height={1} fill="#fff" opacity={0.75} />
    </g>
  ) : (
    <rect x={x - 3.2} y={y - 1.7} width={6.4} height={3.4} rx={1} fill={led.off} stroke={led.offStroke} strokeWidth={0.6} />
  )
}

/** RJ45 opening with its latch notch (bottom, or top when the socket is mounted upside down). */
function rj45Path({ x, y, w, h, flipped }: PanelSocket): string {
  const notchWidth = w * 0.42
  const notchDepth = h * 0.2
  const left = x + (w - notchWidth) / 2
  const right = x + (w + notchWidth) / 2
  return flipped
    ? `M${x} ${y + notchDepth}H${left}V${y}H${right}V${y + notchDepth}H${x + w}V${y + h}H${x}Z`
    : `M${x} ${y}H${x + w}V${y + h - notchDepth}H${right}V${y + h}H${left}V${y + h - notchDepth}H${x}Z`
}

function Rj45({ socket, palette }: { socket: PanelSocket; palette: PanelPalette }) {
  const { x, y, w, h, flipped } = socket
  const isConsole = socket.shape === 'console'
  const colours = isConsole ? palette.console : palette.socket
  const pinTop = flipped ? y + h - 1.5 - h * 0.22 : y + 1.5
  const pins = Array.from({ length: 8 }, (_, index) => x + w * 0.2 + index * ((w * 0.6) / 7))
  return (
    <g>
      {isConsole && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={palette.round ? 5 : 2} fill={palette.console.ring} />}
      {!isConsole && palette.socket.bezel && <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={1.5} fill={palette.socket.bezel} opacity={0.55} />}
      <path d={rj45Path(socket)} fill={colours.fill} stroke={colours.stroke} strokeWidth={palette.round ? 1.2 : 0.8} strokeLinejoin="round" />
      {!palette.round && <path d={`M${x + 1} ${flipped ? y + h - 1.4 : y + 1.4}H${x + w - 1}`} stroke="#000" strokeOpacity={0.6} strokeWidth={1.6} />}
      {pins.map((px) => (
        <line key={px} x1={px} y1={pinTop} x2={px} y2={pinTop + h * 0.22} stroke={palette.socket.pins} strokeWidth={palette.round ? 0.9 : 0.8} opacity={palette.round ? 0.7 : 1} />
      ))}
    </g>
  )
}

/** SFP cage for a fiber module: metal frame with the two LC openings. */
function Sfp({ socket, palette }: { socket: PanelSocket; palette: PanelPalette }) {
  const { x, y, w, h } = socket
  const hole = { w: w * 0.26, h: h * 0.5 }
  return (
    <g>
      <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} rx={1.5} fill={palette.round ? '#9fd0f7' : '#c7ccd3'} opacity={palette.round ? 0.8 : 1} />
      <rect x={x} y={y} width={w} height={h} rx={1} fill={palette.socket.fill} stroke={palette.socket.stroke} strokeWidth={0.8} />
      <rect x={x + w * 0.16} y={y + (h - hole.h) / 2} width={hole.w} height={hole.h} rx={0.8} fill="#000" stroke={palette.socket.pins} strokeWidth={0.5} />
      <rect x={x + w * 0.58} y={y + (h - hole.h) / 2} width={hole.w} height={hole.h} rx={0.8} fill="#000" stroke={palette.socket.pins} strokeWidth={0.5} />
    </g>
  )
}

/** Serial WAN connector: a D-shaped shell with two rows of pins. */
function Serial({ socket, palette }: { socket: PanelSocket; palette: PanelPalette }) {
  const { x, y, w, h } = socket
  const slant = w * 0.08
  const d = `M${x} ${y}H${x + w}L${x + w - slant} ${y + h}H${x + slant}Z`
  const pins = Array.from({ length: 7 }, (_, index) => x + w * 0.18 + index * ((w * 0.64) / 6))
  return (
    <g>
      <path d={d} fill={palette.socket.fill} stroke={palette.round ? palette.socket.stroke : '#9ca3af'} strokeWidth={1} strokeLinejoin="round" />
      {pins.map((px, index) => (
        <g key={px}>
          <circle cx={px} cy={y + h * 0.36} r={0.9} fill={palette.socket.pins} />
          {index < 6 && <circle cx={px + (w * 0.64) / 12} cy={y + h * 0.66} r={0.9} fill={palette.socket.pins} />}
        </g>
      ))}
    </g>
  )
}

/** The cable's plug in the socket, in the cable's colour (CABLE_STYLE). */
function Plug({ socket, cable, palette }: { socket: PanelSocket; cable: NonNullable<PortPanelState['plug']>; palette: PanelPalette }) {
  const { x, y, w, h, flipped } = socket
  const radius = Math.min(w, h) * 0.26
  const cy = y + h / 2 + (flipped ? -2 : 2)
  return (
    <g className={CABLE_STYLE[cable].tone}>
      <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} rx={palette.round ? 4 : 2.5} fill="currentColor" stroke="rgba(0,0,0,.45)" strokeWidth={0.8} />
      <rect x={x + 2.5} y={flipped ? y + h * 0.5 : y + 2.5} width={w - 5} height={h * 0.3} rx={1} fill="#fff" opacity={palette.round ? 0.4 : 0.28} />
      <circle cx={x + w / 2} cy={cy} r={radius} fill="rgba(0,0,0,.28)" />
      <circle cx={x + w / 2 - radius * 0.3} cy={cy - radius * 0.3} r={radius * 0.35} fill="#fff" opacity={0.25} />
    </g>
  )
}

/** Socket of any shape, with the plug drawn in when a cable is connected. */
export function SocketArt({ socket, plug, palette }: { socket: PanelSocket; plug: PortPanelState['plug']; palette: PanelPalette }) {
  let body
  if (socket.shape === 'sfp') body = <Sfp socket={socket} palette={palette} />
  else if (socket.shape === 'serial') body = <Serial socket={socket} palette={palette} />
  else body = <Rj45 socket={socket} palette={palette} />
  return (
    <>
      {body}
      {plug !== null && <Plug socket={socket} cable={plug} palette={palette} />}
    </>
  )
}

/** Wi-Fi mark of a radio or a wireless NIC (no socket: the "cable" is the air). */
export function WifiMark({ x, y, active, palette, colour }: Point & { active: boolean; palette: PanelPalette; colour: string }) {
  const arcs = [4.5, 8.5, 12.5]
  return (
    <g opacity={active ? 1 : 0.55}>
      {arcs.map((r) => (
        <path
          key={r}
          d={`M${x - r * 0.75} ${y + 4 - r * 0.62}A${r} ${r} 0 0 1 ${x + r * 0.75} ${y + 4 - r * 0.62}`}
          fill="none"
          stroke={colour}
          strokeWidth={palette.round ? 2 : 1.6}
          strokeLinecap="round"
        />
      ))}
      <circle cx={x} cy={y + 4} r={1.8} fill={colour} />
    </g>
  )
}
