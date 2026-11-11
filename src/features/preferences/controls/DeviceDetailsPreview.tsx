import type { DeviceDetailsMode } from '../../../preferences'

/** Map devices of the schematic: x, y of each small square (same in both drawings). */
const NODES = [[12, 30], [24, 20], [38, 30]] as const

/** Schematic workspace showing where a device's tabs open: the right panel or floating windows (decorative). */
function DeviceDetailsPreview({ mode }: { mode: DeviceDetailsMode }) {
  const panel = mode === 'panel'
  // The map: left of the panel, or the whole width when windows float over it.
  const mapWidth = panel ? 48 : 62
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16 py-0.5" data-device-details-preview={mode}>
      <rect x="0.5" y="0.5" width="63" height="39" rx="2" className="fill-surface stroke-border-strong" />
      <rect x="1" y="1" width="62" height="5" rx="1.5" className="fill-surface-muted" />
      <rect x="1" y="6" width={mapWidth} height="33" className="fill-canvas" />
      <line x1={NODES[0][0]} y1={NODES[0][1]} x2={NODES[1][0]} y2={NODES[1][1]} className="stroke-cable" strokeWidth="1" />
      <line x1={NODES[1][0]} y1={NODES[1][1]} x2={NODES[2][0]} y2={NODES[2][1]} className="stroke-cable" strokeWidth="1" />
      {NODES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2.5} y={y - 2.5} width="5" height="5" rx="1" className="fill-node stroke-node-border" strokeWidth="0.75" />
      ))}
      {panel ? (
        <>
          <rect x="49" y="6" width="14" height="33" className="fill-accent-muted stroke-accent-text" strokeWidth="0.75" />
          <rect x="51" y="9" width="10" height="2" rx="0.5" className="fill-accent-text" />
          <rect x="51" y="13" width="10" height="9" rx="0.75" className="fill-accent-text" opacity="0.45" />
        </>
      ) : (
        <>
          <rect x="30" y="9" width="22" height="16" rx="1.5" className="fill-surface stroke-border-strong" strokeWidth="0.75" />
          <rect x="38" y="15" width="22" height="17" rx="1.5" className="fill-accent-muted stroke-accent-text" strokeWidth="0.75" />
          <rect x="38.4" y="15.4" width="21.2" height="3" rx="1" className="fill-accent-text" opacity="0.6" />
          <rect x="40" y="21" width="18" height="9" rx="0.75" className="fill-accent-text" opacity="0.35" />
        </>
      )}
    </svg>
  )
}

export default DeviceDetailsPreview
