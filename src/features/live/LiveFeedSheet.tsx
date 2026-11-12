import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'

interface LiveFeedSheetProps {
  onClose: () => void
  children: ReactNode
}

/** The activity feed as a bottom sheet on narrow screens (below the side-panel breakpoint). */
function LiveFeedSheet({ onClose, children }: LiveFeedSheetProps) {
  const { t } = useTranslation('live')
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-slate-900/30 dark:bg-black/60" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="liveFeedSheetTitle"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface-subtle p-3 shadow-2xl sm:p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="liveFeedSheetTitle" className="text-base font-semibold text-fg-strong">
            {t('feed.title')}
          </h2>
          <button
            type="button"
            // Opened on purpose: the close button takes the focus.
            autoFocus
            onClick={onClose}
            aria-label={t('feed.close')}
            className={`rounded p-1 text-fg-subtle hover:bg-surface-strong ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default LiveFeedSheet
