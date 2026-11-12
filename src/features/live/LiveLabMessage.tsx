import { ArrowLeft, LoaderCircle, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveLabStatus } from '../../live'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import LiveStatusPill from './LiveStatusPill'

/**
 * Full page while there is no lab to show: waiting for the first snapshot, or the lab is gone
 * (expired / not found) or the server refused this page.
 */
function LiveLabMessage({ status }: { status: LiveLabStatus }) {
  const { t } = useTranslation('live')
  const waiting = status === 'connecting' || status === 'reconnecting' || status === 'live'
  const ended = status === 'ended' || status === 'notFound'
  const title = waiting ? t('waiting') : ended ? t('ended.title') : t('error.title')
  const body = waiting ? null : ended ? t('ended.body') : t('error.body')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-4 text-center">
      <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <Radio className="h-4 w-4" aria-hidden="true" />
        {t('kicker')}
        <LiveStatusPill status={status} />
      </div>
      {waiting && <LoaderCircle className="h-8 w-8 animate-spin text-accent-text motion-reduce:animate-none" aria-hidden="true" />}
      <h1 className="max-w-md text-lg font-semibold text-fg-strong">{title}</h1>
      {body && <p className="max-w-md text-sm text-fg-muted">{body}</p>}
      {!waiting && (
        <div className="flex flex-wrap justify-center gap-2">
          <AppLink
            to={routes.lab}
            className={`rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover ${focusRing}`}
          >
            {t('ended.openLabs')}
          </AppLink>
          <AppLink
            to={routes.landing}
            className={`flex items-center gap-1.5 rounded-lg border border-border-strong px-4 py-2 text-sm text-fg hover:bg-surface-muted ${focusRing}`}
          >
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {t('back')}
          </AppLink>
        </div>
      )}
    </main>
  )
}

export default LiveLabMessage
