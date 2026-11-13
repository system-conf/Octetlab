import { CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../../i18n'
import { routes } from '../../../routing'
import SiteHeader from '../../layout/SiteHeader'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import { ShareTableBuilder } from '../model/ShareTables'
import { useShareErrorText } from '../useShareErrorText'
import ShareActions from './ShareActions'
import ShareTablesView from './ShareTablesView'
import ShareTopologyView from './ShareTopologyView'
import { useSharedLab, type SharedLab } from './useSharedLab'

type Ready = Extract<SharedLab, { phase: 'ready' }>

function SharedLabView({ shareId, shared, onDeleted }: { shareId: string; shared: Ready; onDeleted: () => void }) {
  const { t } = useTranslation('share')
  const { language } = useLanguage()
  const { record, doc } = shared
  const tables = useMemo(() => ShareTableBuilder.build(doc), [doc])
  const date = new Date(record.createdAt).toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-text">{t('page.kicker')}</p>
        <h1 className="text-2xl font-bold text-fg-strong sm:text-3xl">{record.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          {record.author !== '' && <span>{t('page.byAuthor', { author: record.author })}</span>}
          {record.linkedinUrl !== '' && (
            <a href={record.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className={`text-accent-text underline ${focusRing}`}>
              {t('page.linkedin')}
            </a>
          )}
          <span>{t('page.sharedOn', { date })}</span>
        </p>
        {record.description !== '' && <p className="max-w-3xl whitespace-pre-line text-fg">{record.description}</p>}
      </header>
      <ShareActions shareId={shareId} doc={doc} onDeleted={onDeleted} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-fg-strong">{t('page.topology')}</h2>
        <ShareTopologyView doc={doc} />
      </section>
      <ShareTablesView tables={tables} />
      <AppLink to={routes.landing} className={`self-start text-sm font-medium text-accent-text underline ${focusRing}`}>
        {t('page.buildOwn')}
      </AppLink>
    </>
  )
}

/** Public share page (`/p/<id>`): the frozen lab, read-only, with its generated tables. */
function SharePageScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation('share')
  const errorText = useShareErrorText()
  const shared = useSharedLab(shareId)
  const [deleted, setDeleted] = useState(false)
  useDocumentMeta(shared.phase === 'ready' && !deleted ? shared.record.title : t('page.kicker'))

  let body
  if (deleted) body = <p role="status" className="text-fg">{t('page.deleted')}</p>
  else if (shared.phase === 'loading') body = <p role="status" className="text-fg-muted">{t('page.loading')}</p>
  else if (shared.phase === 'failed')
    body = (
      <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        {errorText(shared.failure)}
      </p>
    )
  else body = <SharedLabView shareId={shareId} shared={shared} onDeleted={() => setDeleted(true)} />

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 sm:py-10">{body}</main>
    </div>
  )
}

export default SharePageScreen
