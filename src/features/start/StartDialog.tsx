import { ArrowRight, BookOpen, Info, ListChecks, PencilRuler, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../routing'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import StartLinkCard from './StartLinkCard'
import StartRecentLabs, { type StartLabActions } from './StartRecentLabs'

interface StartDialogProps {
  /** Title of the lab open behind the dialog ('' = untitled). */
  currentTitle: string
  actions: StartLabActions
  onClose: () => void
}

/**
 * The Start dialog over the lab workspace (like a desktop lab app's start screen): recent labs, a new
 * or opened lab file, ready-made labs, exercises and design tasks, and the About page. Closing it
 * continues with the lab behind it.
 */
function StartDialog({ currentTitle, actions, onClose }: StartDialogProps) {
  const { t } = useTranslation(['start'])
  const titleId = useId()
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    continueRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const continueLabel = currentTitle.trim() === '' ? t('start:dialog.continue') : t('start:dialog.continueTitled', { title: currentTitle })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-2 dark:bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          onClose()
        }}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-2xl bg-surface-subtle p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-fg-strong">
              {t('start:dialog.title')}
            </h2>
            <p className="text-sm text-fg-subtle">{t('start:dialog.lead')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('start:dialog.close')} className={`rounded p-1 text-fg-subtle hover:bg-surface-muted ${focusRing}`}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <StartRecentLabs actions={actions} onDone={onClose} />
          <div className="flex flex-col gap-4">
            <section aria-labelledby="startSamplesTitle" className="flex flex-col gap-2">
              <h3 id="startSamplesTitle" className="text-sm font-semibold text-fg-strong">
                {t('start:samples.title')}
              </h3>
              <StartLinkCard to={routes.samples} icon={BookOpen} title={t('start:samples.cta')} text={t('start:samples.text')} />
            </section>
            <section aria-labelledby="startLearnTitle" className="flex flex-col gap-2">
              <h3 id="startLearnTitle" className="text-sm font-semibold text-fg-strong">
                {t('start:learn.title')}
              </h3>
              <StartLinkCard to={routes.exercises} icon={ListChecks} title={t('start:learn.exercises.title')} text={t('start:learn.exercises.text')} />
              <StartLinkCard to={routes.designs} icon={PencilRuler} title={t('start:learn.design.title')} text={t('start:learn.design.text')} />
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <AppLink to={routes.about} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg-strong ${focusRing}`}>
            <Info className="h-4 w-4" aria-hidden="true" />
            {t('start:about.link')}
          </AppLink>
          <button
            ref={continueRef}
            type="button"
            onClick={onClose}
            className={`flex max-w-full items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover ${focusRing}`}
          >
            <span className="truncate">{continueLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default StartDialog
