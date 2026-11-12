import { Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveEvent } from '../../live'
import { focusRing } from '../shared/focusRing'

interface LiveFeedFooterProps {
  events: readonly LiveEvent[]
  feedOpen: boolean
  /** Id of the side panel the button shows or hides (wide screens). */
  feedControls: string | undefined
  onToggleFeed: () => void
}

/** Bottom bar: the activity toggle with its count and the newest action in one line. */
function LiveFeedFooter({ events, feedOpen, feedControls, onToggleFeed }: LiveFeedFooterProps) {
  const { t } = useTranslation('live')
  const latest = events[0]
  return (
    <footer className="flex items-center gap-2 border-t border-border bg-surface px-2 py-2 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleFeed}
        aria-expanded={feedOpen}
        aria-controls={feedControls}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium ${
          feedOpen ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200' : 'border-border-strong bg-surface text-fg hover:bg-surface-subtle'
        } ${focusRing}`}
      >
        <Activity className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('feed.toggle')}</span>
        <span className="text-fg-subtle">{t('feed.count', { count: events.length })}</span>
      </button>
      {latest && (
        <p className="min-w-0 flex-1 truncate text-sm text-fg-muted" title={t('feed.latest', { summary: latest.summary })}>
          <span lang="en">{latest.summary}</span>
        </p>
      )}
    </footer>
  )
}

export default LiveFeedFooter
