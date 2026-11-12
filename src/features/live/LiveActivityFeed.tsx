import { Bot, SquareTerminal } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'
import type { LiveEvent } from '../../live'

interface LiveActivityFeedProps {
  /** Newest first. */
  events: readonly LiveEvent[]
  /** Device name for an id (falls back to the id). */
  nameOf: (deviceId: string) => string
}

/** Clock time of an event in the UI language; the raw text when the server's time is not a date. */
function useTimeFormat(): (iso: string) => string {
  const { language } = useLanguage()
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return (iso: string) => {
      const time = Date.parse(iso)
      return Number.isNaN(time) ? iso : formatter.format(time)
    }
  }, [language])
}

/**
 * The assistant's actions, newest first: time, tool and summary (English user content from the
 * server, shown as is), and a command's output as a monospace block.
 */
function LiveActivityFeed({ events, nameOf }: LiveActivityFeedProps) {
  const { t } = useTranslation('live')
  const formatTime = useTimeFormat()

  if (events.length === 0) return <p className="py-6 text-center text-sm text-fg-subtle">{t('feed.empty')}</p>

  return (
    <ol className="flex flex-col gap-2" aria-live="polite" aria-relevant="additions">
      {events.map((event) => (
        <li key={`${event.version}|${event.at}|${event.tool}|${event.summary}`} className="rounded-lg border border-border bg-surface p-2.5 text-sm">
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <time dateTime={event.at}>{formatTime(event.at)}</time>
            <code className="truncate rounded bg-surface-muted px-1 py-px font-mono text-[11px] text-fg-muted">{event.tool}</code>
          </div>
          <p lang="en" className="mt-1 break-words text-fg-strong">
            {event.summary}
          </p>
          {event.output && (
            <figure className="mt-2">
              <figcaption className="mb-1 flex items-center gap-1.5 text-xs text-fg-muted">
                <SquareTerminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <code className="font-mono">{event.output.command}</code>
                <span className="truncate">{t('feed.outputOn', { device: nameOf(event.output.deviceId) })}</span>
              </figcaption>
              <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-2 font-mono text-xs leading-snug text-slate-100 dark:bg-black">
                {event.output.lines.join('\n')}
              </pre>
            </figure>
          )}
        </li>
      ))}
    </ol>
  )
}

export default LiveActivityFeed
