import type { LucideIcon } from 'lucide-react'
import type { AppRoute } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'

interface StartLinkCardProps {
  to: AppRoute
  icon: LucideIcon
  title: string
  text: string
}

/** One way into the app on the Start dialog (ready-made labs, exercises, design tasks). */
function StartLinkCard({ to, icon: Icon, title, text }: StartLinkCardProps) {
  return (
    <AppLink
      to={to}
      className={`flex items-start gap-3 rounded-xl border border-border bg-surface p-3 hover:border-accent hover:bg-accent-muted ${focusRing}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent-text">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg-strong">{title}</span>
        <span className="block text-xs leading-relaxed text-fg-subtle">{text}</span>
      </span>
    </AppLink>
  )
}

export default StartLinkCard
