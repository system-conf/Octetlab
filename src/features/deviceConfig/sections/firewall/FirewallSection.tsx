import { BrickWall } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FirewallConnection } from '../../../../sim/contract/FirewallRuntime'
import SectionCard from '../../fields/SectionCard'
import type { SectionProps } from '../sectionTypes'
import FirewallConnectionList from './FirewallConnectionList'
import { FirewallFormModel } from './FirewallFormModel'
import FirewallForm from './FirewallForm'

interface FirewallSectionProps extends SectionProps {
  /** The device's live connection table, when the host has a simulation runtime; else a `show conn` hint. */
  connections?: readonly FirewallConnection[]
  /** Virtual clock of that runtime (ms). */
  now?: number
}

/**
 * Firewall card (docs/FIREWALL_PACK.md §7): interface names and levels, the same-security switches,
 * ICMP tracking, idle timeouts and a read-only view of the connection table.
 */
function FirewallSection({ device, access, saved, onSave, connections, now = 0 }: FirewallSectionProps) {
  const { t } = useTranslation('firewall')
  return (
    <SectionCard title={t('section.title')} icon={BrickWall} access={access} saved={saved}>
      <FirewallForm key={FirewallFormModel.interfacesKey(device)} device={device} editable={access === 'editable'} onSave={onSave} />
      <FirewallConnectionList connections={connections} now={now} />
    </SectionCard>
  )
}

export default FirewallSection
