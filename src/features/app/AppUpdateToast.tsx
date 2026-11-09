import { RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppUpdateModel } from '../../pwa/AppUpdateModel'
import { focusRing } from '../shared/focusRing'
import { useAppUpdatePhase } from './useAppUpdatePhase'

interface AppUpdateToastProps {
  model: AppUpdateModel
}

/**
 * "New version available — Reload" (docs/PWA.md). Non-blocking: it never takes focus and the
 * page only reloads when the user presses Reload. The live region stays mounted so screen
 * readers announce the message when it appears.
 */
function AppUpdateToast({ model }: AppUpdateToastProps) {
  const { t } = useTranslation('common')
  const phase = useAppUpdatePhase(model)
  const visible = phase !== 'idle'
  const applying = phase === 'applying'

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-center sm:inset-x-auto sm:right-4 sm:bottom-4"
    >
      {visible && (
        <div
          role="status"
          className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg shadow-lg"
        >
          <span className="flex-1">{phase === 'failed' ? t('appUpdate.failed') : t('appUpdate.ready')}</span>
          {phase !== 'failed' && (
            <button
              type="button"
              disabled={applying}
              onClick={() => void model.applyNow()}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-70 ${focusRing}`}
            >
              <RefreshCw className={`h-4 w-4 ${applying ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              {applying ? t('appUpdate.reloading') : t('appUpdate.reload')}
            </button>
          )}
          {!applying && (
            <button
              type="button"
              onClick={() => model.dismiss()}
              aria-label={t('appUpdate.dismiss')}
              className={`shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default AppUpdateToast
