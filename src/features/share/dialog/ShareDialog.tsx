import { CircleAlert, Link2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { SHARE_LIMITS, shareDraftSchema } from '../model/shareContract'
import { useShareErrorText } from '../useShareErrorText'
import ShareCreatedPanel from './ShareCreatedPanel'
import ShareField from './ShareField'
import { useShareCreation, type ShareTexts } from './useShareCreation'

interface ShareDialogProps {
  doc: LabDocument
  onClose: () => void
  /** The old, server-free share: the whole lab in a `#lab=…` link. */
  onCopyLongLink: () => void
}

type FieldErrors = { title: string | null; linkedinUrl: string | null }

/** File → Share as a page: title, author, LinkedIn, description → a short public link (/p/<id>). */
function ShareDialog({ doc, onClose, onCopyLongLink }: ShareDialogProps) {
  const { t } = useTranslation('share')
  const errorText = useShareErrorText()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const { state, create } = useShareCreation(doc)
  const [texts, setTexts] = useState<ShareTexts>({ title: doc.meta.title, author: doc.meta.author ?? '', linkedinUrl: '', description: doc.meta.description ?? '' })
  const [errors, setErrors] = useState<FieldErrors>({ title: null, linkedinUrl: null })

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const setTitle = (title: string) => setTexts((current) => ({ ...current, title }))
  const setAuthor = (author: string) => setTexts((current) => ({ ...current, author }))
  const setLinkedinUrl = (linkedinUrl: string) => setTexts((current) => ({ ...current, linkedinUrl }))
  const setDescription = (description: string) => setTexts((current) => ({ ...current, description }))

  function submit(event: FormEvent) {
    event.preventDefault()
    // Same schema as the server: the user sees field errors before anything is sent.
    const checked = shareDraftSchema.safeParse({ ...texts, doc: '{}' })
    const failed = (field: string) => !checked.success && checked.error.issues.some((issue) => issue.path[0] === field)
    const next: FieldErrors = { title: failed('title') ? t('errors.titleRequired') : null, linkedinUrl: failed('linkedinUrl') ? t('errors.linkedinUrl') : null }
    setErrors(next)
    if (next.title === null && next.linkedinUrl === null) create(texts)
  }

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
        className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-fg-strong">
            {t('dialog.title')}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('dialog.close')} className={`rounded p-1 text-fg-subtle hover:bg-surface-muted ${focusRing}`}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {state.phase === 'done' ? (
          <ShareCreatedPanel url={state.url} created={state.created} tokenKept={state.tokenKept} />
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted">{t('dialog.lead')}</p>
            <ShareField label={t('dialog.titleLabel')} value={texts.title} onChange={setTitle} maxLength={SHARE_LIMITS.titleLength} error={errors.title} />
            <ShareField label={t('dialog.authorLabel')} value={texts.author} onChange={setAuthor} maxLength={SHARE_LIMITS.authorLength} />
            <ShareField
              label={t('dialog.linkedinLabel')}
              type="url"
              value={texts.linkedinUrl}
              onChange={setLinkedinUrl}
              maxLength={SHARE_LIMITS.linkedinLength}
              placeholder={t('dialog.linkedinPlaceholder')}
              hint={t('dialog.linkedinHint')}
              error={errors.linkedinUrl}
            />
            <ShareField label={t('dialog.descriptionLabel')} value={texts.description} onChange={setDescription} maxLength={SHARE_LIMITS.descriptionLength} multiline />
            <p className="rounded-lg bg-warning-muted px-3 py-2 text-xs text-warning">{t('dialog.privacy')}</p>
            {state.phase === 'failed' && (
              <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {errorText(state.failure)}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={onCopyLongLink} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-xs text-fg-muted hover:bg-surface-muted ${focusRing}`}>
                <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('dialog.longLink')}
              </button>
              <button
                type="submit"
                disabled={state.phase === 'busy'}
                className={`rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60 ${focusRing}`}
              >
                {state.phase === 'busy' ? t('dialog.creating') : t('dialog.create')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ShareDialog
