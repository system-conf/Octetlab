import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceKindIcon } from '../../../catalog'
import type { AnnotationColor } from '../../../domain'
import type { HandoverSource } from '../../../design'
import { TopologySketch, type SketchNote, type SketchZone } from './TopologySketch'

interface HandoverTopologyProps {
  source: HandoverSource
}

const ICON_SIZE = 34

/** SVG classes per annotation colour: zone outline / fill, zone label, note box and note text. */
const COLOR_CLASSES: Readonly<Record<AnnotationColor, { zone: string; label: string; note: string; text: string }>> = {
  neutral: { zone: 'fill-slate-50 stroke-slate-400 dark:fill-slate-900/40', label: 'fill-slate-700 dark:fill-slate-200', note: 'fill-surface stroke-slate-300', text: 'fill-fg' },
  blue: { zone: 'fill-sky-50 stroke-sky-400 dark:fill-sky-950/40', label: 'fill-sky-800 dark:fill-sky-200', note: 'fill-sky-50 stroke-sky-300 dark:fill-sky-950/40', text: 'fill-sky-900 dark:fill-sky-200' },
  green: { zone: 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/40', label: 'fill-emerald-800 dark:fill-emerald-200', note: 'fill-emerald-50 stroke-emerald-300 dark:fill-emerald-950/40', text: 'fill-emerald-900 dark:fill-emerald-200' },
  amber: { zone: 'fill-amber-50 stroke-amber-400 dark:fill-amber-950/40', label: 'fill-amber-800 dark:fill-amber-200', note: 'fill-amber-50 stroke-amber-300 dark:fill-amber-950/40', text: 'fill-amber-900 dark:fill-amber-200' },
  red: { zone: 'fill-rose-50 stroke-rose-400 dark:fill-rose-950/40', label: 'fill-rose-800 dark:fill-rose-200', note: 'fill-rose-50 stroke-rose-300 dark:fill-rose-950/40', text: 'fill-rose-900 dark:fill-rose-200' },
  purple: { zone: 'fill-violet-50 stroke-violet-400 dark:fill-violet-950/40', label: 'fill-violet-800 dark:fill-violet-200', note: 'fill-violet-50 stroke-violet-300 dark:fill-violet-950/40', text: 'fill-violet-900 dark:fill-violet-200' },
}

function ZoneShape({ zone }: { zone: SketchZone }) {
  const classes = `${COLOR_CLASSES[zone.color].zone} stroke-[1.5]`
  return zone.ellipse ? (
    <ellipse cx={zone.x + zone.width / 2} cy={zone.y + zone.height / 2} rx={zone.width / 2} ry={zone.height / 2} strokeDasharray="6 4" className={classes} />
  ) : (
    <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={10} strokeDasharray="6 4" className={classes} />
  )
}

function NoteBox({ note }: { note: SketchNote }) {
  const classes = COLOR_CLASSES[note.color]
  return (
    <g>
      <rect x={note.x} y={note.y} width={note.width} height={note.height} rx={6} className={`${classes.note} stroke-1`} />
      <text x={note.x + 8} y={note.y + 8} fontSize={note.fontSize} className={classes.text}>
        {note.lines.map((line, index) => (
          // Lines of user text: their position is their identity.
          <tspan key={`${note.id}-${index}`} x={note.x + 8} dy={index === 0 ? note.fontSize : note.fontSize * 1.35}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/** The topology picture of the handover pack: coloured zones, cables, devices with addresses and notes. */
function HandoverTopology({ source }: HandoverTopologyProps) {
  const { t } = useTranslation('design')
  const sketch = useMemo(() => TopologySketch.build(source), [source])
  if (!sketch) return null
  const { viewBox } = sketch

  return (
    <section aria-labelledby="handover-topology" className="flex flex-col gap-3 break-inside-avoid">
      <h2 id="handover-topology" className="border-b border-border-strong pb-1 text-lg font-semibold">
        {t('ui.handover.topology')}
      </h2>
      <svg
        role="img"
        aria-label={t('ui.handover.topologyAria', { count: sketch.nodes.length })}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="max-h-[40rem] w-full rounded-lg border border-border bg-surface"
      >
        {sketch.zones.map((zone) => (
          <ZoneShape key={zone.id} zone={zone} />
        ))}
        {sketch.zones.map(
          (zone) =>
            zone.label !== undefined && (
              <text key={`${zone.id}-label`} x={zone.x + 10} y={zone.y + 22} className={`${COLOR_CLASSES[zone.color].label} text-[15px] font-semibold`}>
                {zone.label}
              </text>
            ),
        )}
        {sketch.links.map((link) => (
          <line
            key={link.id}
            x1={link.x1}
            y1={link.y1}
            x2={link.x2}
            y2={link.y2}
            strokeWidth={2}
            strokeDasharray={link.wireless || !link.connected ? '6 4' : undefined}
            className={link.connected ? 'stroke-cable' : 'stroke-rose-400'}
          />
        ))}
        {sketch.notes.map((note) => (
          <NoteBox key={note.id} note={note} />
        ))}
        {sketch.nodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={ICON_SIZE / 2 + 7} className="fill-node stroke-node-border" />
            <svg x={node.x - ICON_SIZE / 2} y={node.y - ICON_SIZE / 2} width={ICON_SIZE} height={ICON_SIZE} className="text-fg">
              <DeviceKindIcon kind={node.kind} modelId={node.modelId} className="h-full w-full" aria-hidden="true" />
            </svg>
            <text x={node.x} y={node.y + ICON_SIZE / 2 + 24} textAnchor="middle" strokeWidth={4} paintOrder="stroke" className="fill-fg-strong stroke-surface text-[15px] font-semibold">
              {node.name}
            </text>
            {node.address !== undefined && (
              <text x={node.x} y={node.y + ICON_SIZE / 2 + 42} textAnchor="middle" strokeWidth={4} paintOrder="stroke" className="fill-fg-muted stroke-surface font-mono text-[13px]">
                {node.address}
              </text>
            )}
          </g>
        ))}
      </svg>
    </section>
  )
}

export default HandoverTopology
