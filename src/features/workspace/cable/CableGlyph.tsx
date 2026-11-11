import { Sparkles, Wifi } from 'lucide-react'
import type { CableTool } from '../../../domain'
import { CABLE_STYLE } from '../../shared/cableStyle'

/** Small icon for a cable tool: a coloured cable, the Wi-Fi symbol or the "auto" sparkle. */
function CableGlyph({ tool, className = 'h-5 w-5' }: { tool: CableTool; className?: string }) {
  if (tool === 'auto') return <Sparkles className={className} aria-hidden="true" />
  if (tool === 'wireless') return <Wifi className={className} aria-hidden="true" />
  const { tone, dash } = CABLE_STYLE[tool]
  const path = tool === 'serial' ? 'M3 17 L9 7 L15 17 L21 7' : tool === 'console' ? 'M3 17 C 9 3, 15 21, 21 7' : 'M3 18 L21 6'
  return (
    <svg viewBox="0 0 24 24" className={`${tone} ${className}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dash} />
      <circle cx={3} cy={tool === 'serial' || tool === 'console' ? 17 : 18} r={2} fill="currentColor" />
      <circle cx={21} cy={tool === 'serial' || tool === 'console' ? 7 : 6} r={2} fill="currentColor" />
    </svg>
  )
}

export default CableGlyph
