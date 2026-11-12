import { ReactFlowProvider } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../domain'
import type { LiveLabStatus } from '../../live'
import { routes, useAppRouter } from '../../routing'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import { loadLabLauncher } from '../shared/labLauncherLoader'
import LiveLabMessage from './LiveLabMessage'
import LiveLabWorkspace from './LiveLabWorkspace'
import { useLiveLab, type LiveConnectionFactory } from './useLiveLab'

export interface LiveLabScreenProps {
  labId: string
  /** Default: the MCP Worker (VITE_LIVE_API_ORIGIN). */
  connect?: LiveConnectionFactory
}

/** The message page with the page title (the workspace sets the lab's own title). */
function LiveLabWaiting({ status }: { status: LiveLabStatus }) {
  const { t } = useTranslation('live')
  useDocumentMeta(t('pageTitle'))
  return <LiveLabMessage status={status} />
}

function LiveLabContent({ labId, connect }: LiveLabScreenProps) {
  const router = useAppRouter()
  const state = useLiveLab(labId, connect)
  const { doc } = state

  /** "Copy to my labs": stores the shown lab as a new local lab and opens it in `/lab`; rejects when saving failed. */
  async function copy(current: LabDocument): Promise<void> {
    const launcher = await loadLabLauncher()
    await launcher.saveLabAsNew(current)
    router.navigate(routes.lab)
  }

  if (doc === null) return <LiveLabWaiting status={state.status} />
  return <LiveLabWorkspace labId={labId} state={{ ...state, doc }} onCopy={copy} />
}

/** Lazy-loaded screen of `/live/<labId>`: a lab an assistant builds, watched read-only. */
function LiveLabScreen(props: LiveLabScreenProps) {
  return (
    <ReactFlowProvider key={props.labId}>
      <LiveLabContent key={props.labId} {...props} />
    </ReactFlowProvider>
  )
}

export default LiveLabScreen
