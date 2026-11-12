import { ArrowLeft, FolderPlus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../domain'
import { useLabDocument } from '../../lab/useLabDocument'
import { routes } from '../../routing'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import { usePrefersReducedMotion } from '../shared/usePrefersReducedMotion'
import { useToasts } from '../workspace/useToasts'
import WorkspaceView from '../workspace/WorkspaceView'
import LiveActivityFeed from './LiveActivityFeed'
import LiveFeedFooter from './LiveFeedFooter'
import LiveFeedSheet from './LiveFeedSheet'
import LiveStatusPill from './LiveStatusPill'
import { LIVE_SCOPE_ATTRIBUTE, LiveHighlightCss } from './model/LiveHighlightCss'
import type { LiveLabViewState } from './model/LiveLabStore'
import { useLiveViewport } from './useLiveViewport'

export interface LiveLabWorkspaceProps {
  labId: string
  /** The view state with a document (the screen shows a message page before the first one). */
  state: LiveLabViewState & { doc: LabDocument }
  /** "Copy to my labs": saves the document as a new local lab and opens it; rejects when saving failed. */
  onCopy: (doc: LabDocument) => Promise<void>
}

/**
 * From this width the feed is a side panel next to the canvas; below it is a bottom sheet (with the
 * properties panel beside it, a narrower screen leaves too little map).
 */
const SIDE_PANEL_QUERY = '(min-width: 1536px)'

/**
 * The watched lab in the normal workspace, read-only (ExerciseLockPolicy.readOnlyLab: every device,
 * cable and note locked; never autosaved). Each new document replaces the shown one in place, so
 * selection, open device windows and the viewport stay.
 */
function LiveLabWorkspace({ labId, state, onCopy }: LiveLabWorkspaceProps) {
  const { t } = useTranslation('live')
  const { doc } = state
  const lab = useLabDocument(doc, { autosave: false, labId: `live:${labId}` })
  const [shownDoc, setShownDoc] = useState(doc)
  const policy = useMemo(() => ExerciseLockPolicy.readOnlyLab(lab.doc.state), [lab.doc.state])
  const toasts = useToasts()
  const sidePanelFits = useMediaQuery(SIDE_PANEL_QUERY)
  const reducedMotion = usePrefersReducedMotion()
  const [panelOpen, setPanelOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const panelId = useId()
  const shownProblem = useRef<number | null>(null)
  const title = doc.meta.title.trim() === '' ? t('untitled') : doc.meta.title
  useDocumentMeta(title)
  useLiveViewport(lab.doc)

  // A newer document from the server replaces the shown one (no undo step, nothing saved).
  if (shownDoc !== doc) {
    setShownDoc(doc)
    lab.rewrite(() => doc)
  }

  // A newer document that failed validation: one toast per problem; the last good lab stays.
  const { show } = toasts
  const problemKey = state.problem?.key ?? null
  useEffect(() => {
    if (problemKey === null || shownProblem.current === problemKey) return
    shownProblem.current = problemKey
    show(t('invalidDocument'), 'warning')
  }, [problemKey, show, t])

  async function copy() {
    setCopying(true)
    try {
      await onCopy(lab.doc)
    } catch (error) {
      console.error('The live lab could not be copied to the local labs.', error)
      show(t('copy.failed'), 'error')
    } finally {
      setCopying(false)
    }
  }

  const nameOf = (deviceId: string) => lab.doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  const ended = state.status === 'ended' || state.status === 'notFound' || state.status === 'error'
  const highlightCss = state.highlight ? LiveHighlightCss.build(state.highlight.deviceIds, state.highlight.linkIds, !reducedMotion) : ''
  const feed = <LiveActivityFeed events={state.events} nameOf={nameOf} />

  const headerStart = (
    <>
      <AppLink
        to={routes.landing}
        aria-label={t('backAria')}
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg-strong ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('back')}</span>
      </AppLink>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-accent-text">{t('kicker')}</p>
        <h1 className="truncate text-sm font-semibold text-fg-strong sm:text-base">{title}</h1>
      </div>
      <LiveStatusPill status={state.status} />
    </>
  )

  const headerEnd = (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={copying}
      title={t('copy.action')}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60 ${focusRing}`}
    >
      <FolderPlus className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{copying ? t('copy.busy') : t('copy.action')}</span>
    </button>
  )

  return (
    <div {...{ [LIVE_SCOPE_ATTRIBUTE]: '' }}>
      {highlightCss !== '' && <style>{highlightCss}</style>}
      <WorkspaceView
        lab={lab}
        policy={policy}
        toasts={toasts}
        headerStart={headerStart}
        headerEnd={headerEnd}
        lockedNote={t('readOnly')}
        emptyCanvasText={t('emptyCanvas')}
        banner={
          ended ? (
            <p role="status" className="border-b border-border bg-warning-muted px-3 py-2 text-sm text-warning sm:px-4">
              {t('ended.banner')}
            </p>
          ) : undefined
        }
        sidePanel={
          sidePanelFits && panelOpen ? (
            <aside id={panelId} aria-label={t('feed.title')} className="w-80 shrink-0 overflow-y-auto border-s border-border bg-surface-subtle p-3 2xl:w-96">
              <h2 className="mb-2 text-sm font-semibold text-fg-strong">{t('feed.title')}</h2>
              {feed}
            </aside>
          ) : undefined
        }
        footer={
          <LiveFeedFooter
            events={state.events}
            feedOpen={sidePanelFits ? panelOpen : sheetOpen}
            feedControls={sidePanelFits ? panelId : undefined}
            onToggleFeed={() => (sidePanelFits ? setPanelOpen((open) => !open) : setSheetOpen((open) => !open))}
          />
        }
      />
      {!sidePanelFits && sheetOpen && <LiveFeedSheet onClose={() => setSheetOpen(false)}>{feed}</LiveFeedSheet>}
    </div>
  )
}

export default LiveLabWorkspace
