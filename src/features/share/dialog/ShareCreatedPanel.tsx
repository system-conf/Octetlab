import { Copy, ExternalLink, Share2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { linkedInShareUrl } from '../../layout/siteInfo'
import { focusRing } from '../../shared/focusRing'

interface ShareCreatedPanelProps {
  url: string
  /** false: the same content had been shared before, so this is the earlier link. */
  created: boolean
  /** This browser holds the delete token. */
  tokenKept: boolean
}

/** The ready link: copy, open, post on LinkedIn. */
function ShareCreatedPanel({ url, created, tokenKept }: ShareCreatedPanelProps) {
  const { t } = useTranslation(['share', 'common'])
  const inputId = useId()
  const [copyNote, setCopyNote] = useState<string | null>(null)
  const secondary = `flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-subtle ${focusRing}`

  function copy() {
    Promise.resolve(url)
      .then((text) => navigator.clipboard.writeText(text))
      .then(
        () => setCopyNote(t('share:dialog.copied')),
        (error: unknown) => {
          console.warn('The share link could not be copied.', error)
          setCopyNote(t('share:dialog.copyFailed'))
        },
      )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-fg-strong">{t('share:dialog.createdTitle')}</h3>
      {!created && <p className="text-sm text-fg-muted">{t('share:dialog.reused')}</p>}
      <label htmlFor={inputId} className="text-sm font-medium text-fg-strong">
        {t('share:dialog.linkLabel')}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-fg"
        />
        <button type="button" onClick={copy} className={`flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover ${focusRing}`}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          {t('share:dialog.copy')}
        </button>
      </div>
      <p role="status" className="min-h-4 text-xs text-fg-subtle">
        {copyNote}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className={secondary}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('share:dialog.open')} <span className="sr-only">{t('common:opensInNewTab')}</span>
        </a>
        <a href={linkedInShareUrl(url)} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#004182] ${focusRing}`}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t('share:dialog.shareOnLinkedIn')} <span className="sr-only">{t('common:opensInNewTab')}</span>
        </a>
      </div>
      {tokenKept && <p className="text-xs text-fg-subtle">{t('share:dialog.deleteHint')}</p>}
    </div>
  )
}

export default ShareCreatedPanel
