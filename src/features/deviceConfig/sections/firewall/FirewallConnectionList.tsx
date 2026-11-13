import { useTranslation } from 'react-i18next'
import type { FirewallConnection } from '../../../../sim/contract/FirewallRuntime'
import { FirewallConnectionsModel } from './FirewallConnectionsModel'

interface FirewallConnectionListProps {
  /** The device's runtime table; undefined when the panel has no simulation (then: use `show conn`). */
  connections: readonly FirewallConnection[] | undefined
  /** Virtual clock of that runtime (ms). */
  now: number
}

/** Read-only connection table (docs/FIREWALL_PACK.md §5.2), like `show conn`. */
function FirewallConnectionList({ connections, now }: FirewallConnectionListProps) {
  const { t } = useTranslation('firewall')
  const rows = connections === undefined ? [] : FirewallConnectionsModel.rows(connections, now)
  return (
    <section className="flex min-w-0 flex-col gap-2 border-t border-border/60 pt-3">
      <h4 className="text-sm font-medium text-fg">{t('connections.title')}</h4>
      {connections === undefined && <p className="text-xs text-fg-subtle">{t('connections.noRuntime')}</p>}
      {connections !== undefined && rows.length === 0 && <p className="text-sm text-fg-subtle">{t('connections.empty')}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="text-fg-subtle">
              <tr>
                <th scope="col" className="pe-2 text-start font-medium">{t('connections.protocol')}</th>
                <th scope="col" className="pe-2 text-start font-medium">{t('connections.from')}</th>
                <th scope="col" className="pe-2 text-start font-medium">{t('connections.to')}</th>
                <th scope="col" className="pe-2 text-start font-medium">{t('connections.state')}</th>
                <th scope="col" className="pe-2 text-end font-medium">{t('connections.idle')}</th>
                <th scope="col" className="text-end font-medium">{t('connections.bytes')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="py-1 pe-2">{t(`connections.protocols.${row.protocol}`)}</td>
                  <td className="py-1 pe-2 font-mono" dir="ltr">{row.from}</td>
                  <td className="py-1 pe-2 font-mono" dir="ltr">{row.to}</td>
                  <td className="py-1 pe-2">{t(`connections.states.${row.state}`)}</td>
                  <td className="py-1 pe-2 text-end font-mono">{t('connections.idleValue', { seconds: row.idleSeconds })}</td>
                  <td className="py-1 text-end font-mono">{row.bytes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default FirewallConnectionList
