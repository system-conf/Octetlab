import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SectionCard from '../../fields/SectionCard'
import type { SectionProps } from '../sectionTypes'

/** SSH / Telnet / local users of an IOS device (pack 5.2, owner: agent C). Prelude placeholder. */
function SecuritySection({ access, saved }: SectionProps) {
  const { t } = useTranslation('remoteAccess')
  return (
    <SectionCard title={t('section.title')} icon={KeyRound} access={access} saved={saved}>
      <p className="text-xs text-fg-subtle">{t('section.placeholder')}</p>
    </SectionCard>
  )
}

export default SecuritySection
