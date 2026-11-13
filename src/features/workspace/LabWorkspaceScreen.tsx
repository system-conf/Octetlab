import { ReactFlowProvider } from '@xyflow/react'
import { Network } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreference } from '../../preferences'
// CI (CLI integration): File menu "Export configs".
import { useLabConfigExport } from '../cli'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import { focusRing } from '../shared/focusRing'
// Start dialog: the app opens on the workspace with it (`/`); the header's logo button reopens it.
import StartDialog from '../start/StartDialog'
import { useStartDialog } from '../start/useStartDialog'
import FileMenu from './file/FileMenu'
import RecentLabsDialog from './file/RecentLabsDialog'
import { useLabFileActions } from './file/useLabFileActions'
import { useLabOpening } from './file/useLabOpening'
import { ExerciseLockPolicy, LAB_LIMITS, labEditor, useLabDocument } from './labServices'
import CommitField from './panels/CommitField'
import { useToasts } from './useToasts'
import WorkspaceView from './WorkspaceView'

// Design (D2): the handover pack (File menu) loads on demand.
const HandoverOverlay = lazy(() => import('../design/handover/HandoverOverlay'))
// Share pages (docs/SHARE_PAGES.md): File → "Share as a page" loads on demand.
const ShareDialog = lazy(() => import('../share/dialog/ShareDialog'))

export interface LabWorkspaceScreenProps {
  /** `#lab=…` the page was opened with, or null. */
  shareHash: string | null
  onShareHashUsed: () => void
  /** Entered through `/`: the Start dialog shows over the lab. */
  startOnEntry?: boolean
}

/** The free lab (`/lab`, `/`): autosaved, with the File menu (new, recent, import, export, share, handover pack). */
function LabWorkspace({ shareHash, onShareHashUsed, startOnEntry = false }: LabWorkspaceScreenProps) {
  const { t } = useTranslation(['workspace', 'lab', 'common', 'start'])
  // PU (Preferences → Data): autosave of the free lab can be turned off (exercises, designs and samples never autosave).
  const [autosave] = usePreference('data.autosave')
  const lab = useLabDocument(undefined, { autosave })
  const toasts = useToasts()
  useLabOpening({ lab, notify: toasts.show, shareHash, onShareHashUsed })
  const files = useLabFileActions(lab, toasts.show)
  const exportConfigs = useLabConfigExport(lab.doc, toasts.show)
  const [recentOpen, setRecentOpen] = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // A shared lab being opened wins over the Start dialog.
  const start = useStartDialog(startOnEntry && shareHash === null)
  const title = lab.doc.meta.title
  useDocumentMeta(title === '' ? t('workspace:title') : title)

  const headerStart = (
    <>
      <button
        type="button"
        onClick={start.show}
        aria-label={t('start:headerButton')}
        title={t('start:headerButton')}
        aria-haspopup="dialog"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-accent-text hover:bg-accent-muted ${focusRing}`}
      >
        <Network className="h-6 w-6" aria-hidden="true" />
      </button>
      <CommitField
        label={t('workspace:header.titleLabel')}
        value={title}
        onCommit={(next) => lab.apply((doc) => labEditor.updateMeta(doc, { title: next.trim() }))}
        placeholder={t('lab:untitled')}
        hideLabel
        maxLength={LAB_LIMITS.nameLength}
        className="min-w-0 max-w-md flex-1"
      />
      <FileMenu actions={files} onOpenRecent={() => setRecentOpen(true)} onHandover={() => setHandoverOpen(true)} onExportConfigs={exportConfigs}
        onShare={() => setShareOpen(true)}
      />
    </>
  )

  return (
    <>
      <WorkspaceView lab={lab} policy={ExerciseLockPolicy.none} toasts={toasts} headerStart={headerStart} />
      {recentOpen && <RecentLabsDialog onOpen={files.openRecent} onClose={() => setRecentOpen(false)} />}
      {start.open && <StartDialog currentTitle={title} actions={files} onClose={start.close} />}
      {/* Design (D2): handover pack of the open lab */}
      {handoverOpen && (
        <Suspense fallback={null}>
          <HandoverOverlay source={lab.doc} onClose={() => setHandoverOpen(false)} />
        </Suspense>
      )}
      {shareOpen && (
        <Suspense fallback={null}>
          <ShareDialog
            doc={lab.doc}
            onClose={() => setShareOpen(false)}
            onCopyLongLink={() => {
              setShareOpen(false)
              files.copyShareLink()
            }}
          />
        </Suspense>
      )}
    </>
  )
}

/** Lazy-loaded entry of the `/lab` route. */
function LabWorkspaceScreen(props: LabWorkspaceScreenProps) {
  return (
    <ReactFlowProvider>
      <LabWorkspace {...props} />
    </ReactFlowProvider>
  )
}

export default LabWorkspaceScreen
