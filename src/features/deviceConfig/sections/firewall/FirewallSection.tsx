import { BrickWall } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SectionCard from '../../fields/SectionCard'
import type { SectionProps } from '../sectionTypes'

/**
 * Firewall card (docs/FIREWALL_PACK.md §7, owner: agent C). Prelude placeholder: agent C adds the
 * same-security switches, ICMP inspection, timeouts and the connection table view here.
 */
function FirewallSection({ access, saved }: SectionProps) {
  const { t } = useTranslation('firewall')
  return (
    <SectionCard title={t('section.title')} icon={BrickWall} access={access} saved={saved}>
      <p className="text-xs text-fg-subtle">{t('section.placeholder')}</p>
    </SectionCard>
  )
}

export default FirewallSection
