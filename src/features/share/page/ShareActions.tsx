import { Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../../domain'
import { routes, useAppRouter } from '../../../routing'
import { loadLabLauncher } from '../../shared/labLauncherLoader'
import { focusRing } from '../../shared/focusRing'
import { ShareApiClient } from '../model/ShareApiClient'
import { ShareTokenStore } from '../model/ShareTokenStore'
import { useShareErrorText } from '../useShareErrorText'

type Busy = 'none' | 'opening' | 'deleting'

/** Open a copy in the lab; delete the page when this browser created it. */
function ShareActions({ shareId, doc, onDeleted }: { shareId: string; doc: LabDocument; onDeleted: () => void }) {
  const { t } = useTranslation('share')
  const router = useAppRouter()
  const errorText = useShareErrorText()
  const [tokens] = useState(() => ShareTokenStore.browser())
  const token = tokens.tokenOf(shareId)
  const [busy, setBusy] = useState<Busy>('none')
  const [error, setError] = useState<string | null>(null)

  function openCopy() {
    setBusy('opening')
    setError(null)
    loadLabLauncher()
      .then((launcher) => launcher.saveLabAsNew(doc))
      .then(
        () => router.navigate(routes.lab),
        (failure: unknown) => {
          console.error('The shared lab could not be saved as a copy.', failure)
          setError(t('page.openFailed'))
          setBusy('none')
        },
      )
  }

  function remove() {
    if (token === null || !window.confirm(t('page.deleteConfirm'))) return
    setBusy('deleting')
    setError(null)
    ShareApiClient.browser()
      .remove(shareId, token)
      .then(
        () => {
          tokens.forget(shareId)
          onDeleted()
        },
        (failure: unknown) => {
          console.error('The share page could not be deleted.', failure)
          setError(errorText(failure))
          setBusy('none')
        },
      )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCopy}
          disabled={busy !== 'none'}
          className={`flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60 ${focusRing}`}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {busy === 'opening' ? t('page.opening') : t('page.openCopy')}
        </button>
        {token !== null && (
          <button
            type="button"
            onClick={remove}
            disabled={busy !== 'none'}
            className={`flex items-center gap-1.5 rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 ${focusRing}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {busy === 'deleting' ? t('page.deleting') : t('page.delete')}
          </button>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}

export default ShareActions
