import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShareTables } from '../model/ShareTables'

const cell = 'border-t border-border px-3 py-2 align-top'
const head = 'px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-fg-subtle'

function TableSection({ title, empty, children }: { title: string; empty: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-fg-strong">{title}</h2>
      {empty === null ? <div className="overflow-x-auto rounded-xl border border-border bg-surface">{children}</div> : <p className="text-sm text-fg-muted">{empty}</p>}
    </section>
  )
}

/** The generated tables of a share page: devices with addresses, VLANs, subnets. */
function ShareTablesView({ tables }: { tables: ShareTables }) {
  const { t } = useTranslation(['share', 'catalog'])
  return (
    <div className="flex flex-col gap-8">
      <TableSection title={t('share:page.devices')} empty={tables.devices.length === 0 ? t('share:page.noDevices') : null}>
        <table className="w-full text-sm text-fg">
          <thead>
            <tr>
              <th className={head}>{t('share:page.columns.device')}</th>
              <th className={head}>{t('share:page.columns.type')}</th>
              <th className={head}>{t('share:page.columns.interface')}</th>
              <th className={head}>{t('share:page.columns.address')}</th>
              <th className={head}>{t('share:page.columns.vlan')}</th>
            </tr>
          </thead>
          <tbody>
            {tables.devices.map((device) => {
              const rows = device.interfaces.length === 0 ? [null] : device.interfaces
              return rows.map((iface, index) => (
                <tr key={`${device.deviceId}:${iface?.interfaceId ?? ''}`}>
                  <td className={`${cell} font-medium`}>{index === 0 ? device.name : ''}</td>
                  <td className={`${cell} text-fg-muted`}>{index === 0 ? t(`catalog:kinds.${device.kind}`) : ''}</td>
                  {iface === null ? (
                    <td className={`${cell} text-fg-subtle`} colSpan={3}>
                      {t('share:page.noInterfaces')}
                    </td>
                  ) : (
                    <>
                      <td className={`${cell} font-mono`}>{iface.interfaceId}</td>
                      <td className={`${cell} font-mono`}>
                        {iface.address === '' ? <span className="text-fg-subtle">{t('share:page.noAddress')}</span> : iface.address}
                        {iface.dhcp && <span className="ms-2 rounded bg-surface-muted px-1.5 py-0.5 font-sans text-xs text-fg-muted">{t('share:page.dhcp')}</span>}
                      </td>
                      <td className={`${cell} font-mono`}>{iface.vlan ?? ''}</td>
                    </>
                  )}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </TableSection>
      <TableSection title={t('share:page.vlans')} empty={tables.vlans.length === 0 ? t('share:page.noVlans') : null}>
        <table className="w-full text-sm text-fg">
          <thead>
            <tr>
              <th className={head}>{t('share:page.columns.vlanId')}</th>
              <th className={head}>{t('share:page.columns.vlanName')}</th>
              <th className={head}>{t('share:page.columns.switches')}</th>
            </tr>
          </thead>
          <tbody>
            {tables.vlans.map((vlan) => (
              <tr key={vlan.id}>
                <td className={`${cell} font-mono`}>{vlan.id}</td>
                <td className={cell}>{vlan.name}</td>
                <td className={`${cell} text-fg-muted`}>{vlan.switches.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableSection>
      <TableSection title={t('share:page.subnets')} empty={tables.subnets.length === 0 ? t('share:page.noSubnets') : null}>
        <table className="w-full text-sm text-fg">
          <thead>
            <tr>
              <th className={head}>{t('share:page.columns.network')}</th>
              <th className={head}>{t('share:page.columns.members')}</th>
            </tr>
          </thead>
          <tbody>
            {tables.subnets.map((subnet) => (
              <tr key={subnet.network}>
                <td className={`${cell} font-mono`}>{subnet.network}</td>
                <td className={cell}>
                  <ul className="flex flex-col gap-0.5">
                    {subnet.members.map((member) => (
                      <li key={`${member.deviceName}:${member.interfaceId}`}>
                        <span className="font-mono">{member.address}</span> <span className="text-fg-muted">{`${member.deviceName} ${member.interfaceId}`}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableSection>
    </div>
  )
}

export default ShareTablesView
