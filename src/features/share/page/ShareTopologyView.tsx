import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../../domain'
import { ShareTopology, type NodeGroup } from '../model/ShareTopology'

const BOX = { width: 960, height: 540, padding: { top: 40, right: 70, bottom: 56, left: 70 } }

/** Fill and stroke classes per device group (same colours as the Open Graph picture). */
const GROUP_CLASSES: Readonly<Record<NodeGroup, string>> = {
  internet: 'fill-slate-400 stroke-slate-600',
  router: 'fill-sky-500 stroke-sky-700',
  switch: 'fill-emerald-500 stroke-emerald-700',
  wireless: 'fill-violet-500 stroke-violet-700',
  endpoint: 'fill-amber-400 stroke-amber-600',
}

/** Read-only diagram of the shared lab: devices as labelled circles, cables as lines (wireless dashed). */
function ShareTopologyView({ doc }: { doc: LabDocument }) {
  const { t } = useTranslation('share')
  const frame = useMemo(() => ShareTopology.fit(doc, BOX), [doc])
  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role="img"
      aria-label={t('page.topologyAlt', { count: frame.nodes.length, links: frame.edges.length })}
      className="h-auto w-full rounded-xl border border-border bg-surface-subtle"
    >
      {frame.edges.map((edge) => (
        <line
          key={edge.id}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          strokeWidth={3}
          strokeDasharray={edge.wireless ? '8 8' : undefined}
          className="stroke-slate-400 dark:stroke-slate-500"
        />
      ))}
      {frame.nodes.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r={frame.radius} strokeWidth={3} className={GROUP_CLASSES[node.group]} />
          <text x={node.x} y={node.y + frame.radius + 18} textAnchor="middle" className="fill-fg text-[15px] font-medium">
            {node.name}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default ShareTopologyView
