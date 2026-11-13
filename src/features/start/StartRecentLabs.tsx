import { FilePlus2, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LAB_FILE_ACCEPT } from '../../lab/labFileTypes'
import { focusRing } from '../shared/focusRing'
import RecentLabList from '../shared/RecentLabList'
import { useRecentLabs } from '../shared/useRecentLabs'

export interface StartLabActions {
  /** Opens a saved lab in the workspace (the workspace reports errors as toasts). */
  openRecent: (labId: string) => void
  newLab: () => void
  /** Reads, validates and opens a picked lab file as a new lab. */
  importFile: (file: File) => void
}

interface StartRecentLabsProps {
  actions: StartLabActions
  /** Called after any action, so the dialog closes and the lab shows. */
  onDone: () => void
}

/** "My recent labs" of the Start dialog plus "New empty lab" and "Open a lab file". */
function StartRecentLabs({ actions, onDone }: StartRecentLabsProps) {
  const { t } = useTranslation(['start', 'lab'])
  const recent = useRecentLabs()
  const fileRef = useRef<HTMLInputElement>(null)
  const buttonClass = `flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-subtle ${focusRing}`

  return (
    <section aria-labelledby="startRecentTitle" className="flex min-h-0 flex-col gap-2">
      <div>
        <h3 id="startRecentTitle" className="text-sm font-semibold text-fg-strong">
          {t('start:recent.title')}
        </h3>
        <p className="text-xs text-fg-subtle">{recent.storageAvailable ? t('start:recent.hint') : t('lab:storage.unavailable')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            actions.newLab()
            onDone()
          }}
          className={buttonClass}
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          {t('start:recent.newLab')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('start:recent.openFile')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={LAB_FILE_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            actions.importFile(file)
            onDone()
          }}
        />
      </div>
      <div className="min-h-0 overflow-y-auto sm:max-h-72">
        <RecentLabList
          entries={recent.entries}
          loadingText={t('start:recent.loading')}
          onOpen={(labId) => {
            actions.openRecent(labId)
            onDone()
          }}
          onDelete={recent.remove}
        />
      </div>
    </section>
  )
}

export default StartRecentLabs
