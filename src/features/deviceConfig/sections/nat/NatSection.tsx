import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SectionCard from '../../fields/SectionCard'
import type { SectionProps } from '../sectionTypes'

/** NAT pools and rules of a router (pack 5.2, owner: agent B). Prelude placeholder. */
function NatSection({ access, saved }: SectionProps) {
  const { t } = useTranslation('nat')
  return (
    <SectionCard title={t('section.title')} icon={ArrowLeftRight} access={access} saved={saved}>
      <p className="text-xs text-fg-subtle">{t('section.placeholder')}</p>
    </SectionCard>
  )
}

export default NatSection
