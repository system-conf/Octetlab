import { useReactFlow } from '@xyflow/react'
import {
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Grid3x3,
  Lock,
  Maximize,
  MousePointer2,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableTool } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import CableGlyph from '../cable/CableGlyph'
import { useOfferedCableTools } from '../cable/useOfferedCableTools'
import type { AlignMode } from '../geometry/AlignCalculator'

interface CanvasToolbarProps {
  activeTool: CableTool | null
  onSelectTool: () => void
  onChooseCable: (tool: CableTool) => void
  /** false: no cable tools (exercise with a locked topology). */
  cablesEnabled: boolean
  /** Shown as a lock icon with this explanation (exercise mode). */
  lockedNote?: string
  /** Absent: no "Add note" button (read-only live lab). */
  onAddNote?: () => void
  canDelete: boolean
  onDelete: () => void
  snapToGrid: boolean
  onToggleSnap: () => void
  canAlign: boolean
  onAlign: (mode: AlignMode) => void
}

const ALIGN_BUTTONS: readonly { mode: AlignMode; icon: LucideIcon; label: 'toolbar.alignLeft' | 'toolbar.alignCenter' | 'toolbar.alignTop' }[] = [
  { mode: 'left', icon: AlignStartVertical, label: 'toolbar.alignLeft' },
  { mode: 'center', icon: AlignCenterVertical, label: 'toolbar.alignCenter' },
  { mode: 'top', icon: AlignStartHorizontal, label: 'toolbar.alignTop' },
]

const fitViewOptions = { padding: 0.3, maxZoom: 1.25, duration: 200 }

interface ToolButtonProps {
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  children: ReactNode
}

function ToolButton({ label, onClick, pressed, disabled, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 ring-1 ring-sky-300 dark:ring-sky-700 hover:bg-sky-100 dark:hover:bg-sky-900/40' : ''
      } ${focusRing}`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-surface-strong" aria-hidden="true" />
}

/** Tools above the canvas: select, cables, note, delete, snap, align, zoom. Scrolls sideways on phones. */
function CanvasToolbar(props: CanvasToolbarProps) {
  const { t } = useTranslation('workspace')
  const cableTools = useOfferedCableTools()
  const flow = useReactFlow()
  const { activeTool } = props

  return (
    <div
      role="group"
      aria-label={t('toolbar.label')}
      className="relative flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface px-2 py-1 [scrollbar-width:none]"
    >
      <ToolButton label={t('toolbar.select')} onClick={props.onSelectTool} pressed={activeTool === null}>
        <MousePointer2 className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <Divider />
      {props.cablesEnabled && (
        <>
          <div role="group" aria-label={t('toolbar.cables')} className="flex items-center gap-0.5">
            {cableTools.map((tool) => (
              <ToolButton key={tool} label={t(`cableTools.${tool}`)} onClick={() => props.onChooseCable(tool)} pressed={activeTool === tool}>
                <CableGlyph tool={tool} />
              </ToolButton>
            ))}
          </div>
          <Divider />
        </>
      )}
      {props.onAddNote && (
        <ToolButton label={t('toolbar.addNote')} onClick={props.onAddNote}>
          <StickyNote className="h-5 w-5" aria-hidden="true" />
        </ToolButton>
      )}
      <ToolButton label={t('toolbar.delete')} onClick={props.onDelete} disabled={!props.canDelete}>
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <Divider />
      <ToolButton label={t('toolbar.snap')} onClick={props.onToggleSnap} pressed={props.snapToGrid}>
        <Grid3x3 className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      {ALIGN_BUTTONS.map(({ mode, icon: Icon, label }) => (
        <ToolButton key={mode} label={t(label)} onClick={() => props.onAlign(mode)} disabled={!props.canAlign}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </ToolButton>
      ))}
      <Divider />
      <ToolButton label={t('toolbar.zoomOut')} onClick={() => void flow.zoomOut({ duration: 150 })}>
        <ZoomOut className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <ToolButton label={t('toolbar.zoomIn')} onClick={() => void flow.zoomIn({ duration: 150 })}>
        <ZoomIn className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <ToolButton label={t('toolbar.fitView')} onClick={() => void flow.fitView(fitViewOptions)}>
        <Maximize className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      {props.lockedNote && (
        <p className="ms-auto flex shrink-0 items-center gap-1.5 ps-2 text-xs text-fg-subtle lg:min-w-0 lg:shrink" title={props.lockedNote}>
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only lg:not-sr-only lg:truncate">{props.lockedNote}</span>
        </p>
      )}
    </div>
  )
}

export default CanvasToolbar
