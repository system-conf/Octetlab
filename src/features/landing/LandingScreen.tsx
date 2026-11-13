import { useTranslation } from 'react-i18next'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import SiteHeader from '../layout/SiteHeader'
import HowTheLabWorks from './HowTheLabWorks'
import LandingFooter from './LandingFooter'
import LandingHero from './LandingHero'

/**
 * About page (`/about`): what the lab is, the ways in, how it works, footer. The app itself opens on
 * the lab workspace with the Start dialog (`/`); recent labs live there.
 */
function LandingScreen() {
  const { t } = useTranslation('start')
  useDocumentMeta(t('about.pageTitle'))
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6 sm:py-10">
        <LandingHero />
        <HowTheLabWorks />
        <LandingFooter />
      </main>
    </div>
  )
}

export default LandingScreen
