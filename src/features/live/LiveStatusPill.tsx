import { useTranslation } from 'react-i18next'
import type { LiveLabStatus } from '../../live'

const TONES: Readonly<Record<LiveLabStatus, { pill: string; dot: string }>> = {
  connecting: { pill: 'border-border-strong bg-surface-muted text-fg-muted', dot: 'bg-fg-subtle animate-pulse' },
  live: { pill: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
  reconnecting: { pill: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200', dot: 'bg-amber-500 animate-pulse' },
  ended: { pill: 'border-border-strong bg-surface-muted text-fg-muted', dot: 'bg-fg-subtle' },
  notFound: { pill: 'border-border-strong bg-surface-muted text-fg-muted', dot: 'bg-fg-subtle' },
  error: { pill: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200', dot: 'bg-rose-500' },
}

/** "Live" / "Connecting…" / "Reconnecting…" / "Ended" next to the lab title; announced politely. */
function LiveStatusPill({ status }: { status: LiveLabStatus }) {
  const { t } = useTranslation('live')
  const tone = TONES[status]
  const label = t(`status.${status}`)
  return (
    <span
      role="status"
      aria-label={t('statusAria', { status: label })}
      data-live-status={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.pill}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}

export default LiveStatusPill
