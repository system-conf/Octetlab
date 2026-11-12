import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SectionCard from '../../fields/SectionCard'
import type { SectionProps } from '../sectionTypes'

/** Access lists of a router / L3 switch (pack 5.2, owner: agent A). Prelude placeholder. */
function AccessListsSection({ access, saved }: SectionProps) {
  const { t } = useTranslation('acl')
  return (
    <SectionCard title={t('section.title')} icon={ShieldCheck} access={access} saved={saved}>
      <p className="text-xs text-fg-subtle">{t('section.placeholder')}</p>
    </SectionCard>
  )
}

export default AccessListsSection
