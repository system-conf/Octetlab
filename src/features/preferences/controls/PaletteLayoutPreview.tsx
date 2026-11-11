import type { PaletteLayout } from '../../../preferences'

/** Device tiles drawn in the palette area: x, y of each small square. */
const SIDEBAR_TILES: readonly (readonly [number, number])[] = [
  [3, 10], [9, 10], [3, 16], [9, 16], [3, 22], [9, 22],
]
const BAR_TILES: readonly (readonly [number, number])[] = [
  [14, 33], [20, 33], [26, 33], [32, 33], [38, 33],
]

/** Schematic workspace (header, palette, map, properties panel) showing where the palette sits (decorative). */
function PaletteLayoutPreview({ layout }: { layout: PaletteLayout }) {
  const sidebar = layout === 'sidebar'
  // The map: left of the properties panel, beside the sidebar or above the bar.
  const map = sidebar ? { x: 15, width: 34, height: 34 } : { x: 0, width: 49, height: 24 }
  const centreX = map.x + map.width / 2
  const centreY = 6 + map.height / 2
  const nodes: readonly (readonly [number, number])[] = [[centreX - 9, centreY + 3], [centreX, centreY - 4], [centreX + 9, centreY + 3]]
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16 py-0.5" data-palette-layout-preview={layout}>
      <rect x="0.5" y="0.5" width="63" height="39" rx="2" className="fill-surface stroke-border-strong" />
      <rect x="1" y="1" width="62" height="5" rx="1.5" className="fill-surface-muted" />
      <rect x={map.x + 1} y="6" width={map.width - 1} height={map.height} className="fill-canvas" />
      <line x1={centreX - 9} y1={centreY + 3} x2={centreX} y2={centreY - 4} className="stroke-cable" strokeWidth="1" />
      <line x1={centreX} y1={centreY - 4} x2={centreX + 9} y2={centreY + 3} className="stroke-cable" strokeWidth="1" />
      {nodes.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2.5} y={y - 2.5} width="5" height="5" rx="1" className="fill-node stroke-node-border" strokeWidth="0.75" />
      ))}
      <rect x="49" y="6" width="14" height="33" className="fill-surface-muted" />
      {sidebar ? (
        <rect x="1" y="6" width="14" height="33" className="fill-accent-muted stroke-accent-text" strokeWidth="0.75" />
      ) : (
        <rect x="1" y="30" width="48" height="9" className="fill-accent-muted stroke-accent-text" strokeWidth="0.75" />
      )}
      {sidebar ? null : <rect x="2.5" y="32" width="9" height="5" rx="1" className="fill-accent-text" opacity="0.5" />}
      {(sidebar ? SIDEBAR_TILES : BAR_TILES).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="0.75" className="fill-accent-text" />
      ))}
    </svg>
  )
}

export default PaletteLayoutPreview
