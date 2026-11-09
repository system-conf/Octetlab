import { Cloud, EthernetPort, Globe, Layers, Route, Server, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeviceVisual, findDeviceModel } from '../../catalog'
import type { Device, NetworkState } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import FactList, { type Fact } from './fields/FactList'
import SettingsSection from './fields/SettingsSection'
import { cidrText } from './info/addressText'
import PortInfoList from './info/PortInfoList'
import RoutingTableView from './info/RoutingTableView'
import { ConfigLocks } from './model/ConfigLocks'
import { DeviceInfoModel } from './model/DeviceInfoModel'
import { InternetServiceModel } from './model/InternetServiceModel'

export interface DeviceInfoPanelProps {
  device: Device
  state: NetworkState
  /** The exercise's locks (`ExerciseLockPolicy.none` by default); hidden areas are left out of the summary. */
  policy?: ExerciseLockPolicy
}

/** Read-only summary of a device: model, power, ports with link lights, addressing, routes, services. */
function DeviceInfoPanel({ device, state, policy = ExerciseLockPolicy.none }: DeviceInfoPanelProps) {
  const { t } = useTranslation(['deviceConfig', 'catalog'])
  const translate = useMessageTranslator()
  const model = findDeviceModel(device.modelId)
  const configLocks = new ConfigLocks(device.id, policy)
  const shows = (section: Parameters<ConfigLocks['section']>[0]) => configLocks.section(section) !== 'hidden'
  const notSet = t('info.notSet')

  const general: Fact[] = [
    ...(model ? [{ label: t('info.model'), value: translate({ key: model.nameKey }) }] : []),
    { label: t('info.kind'), value: t(`catalog:kinds.${device.kind}`) },
    ...(shows('power') ? [{ label: t('info.power'), value: device.powered ? t('info.on') : t('info.off') }] : []),
  ]

  const host = device.host
  const hostFacts: Fact[] = host
    ? [
        { label: t('info.gateway'), value: host.defaultGateway || notSet, mono: host.defaultGateway !== '' },
        { label: t('info.dns'), value: host.dnsServers.join(', ') || notSet, mono: host.dnsServers.length > 0 },
      ]
    : []

  const switching = device.switching
  const switchingFacts: Fact[] = switching
    ? [
        { label: t('info.vlans'), value: switching.vlans.map((vlan) => `${vlan.id} ${vlan.name}`).join(', ') },
        ...(switching.svis.length > 0
          ? [{ label: t('info.svis'), value: switching.svis.map((svi) => `Vlan${svi.vlan} ${cidrText(svi.l3.ipv4.address, svi.l3.ipv4.mask)}`).join(', '), mono: true }]
          : []),
        ...(switching.defaultGateway !== '' ? [{ label: t('info.gateway'), value: switching.defaultGateway, mono: true }] : []),
      ]
    : []

  const dhcp = device.services?.dhcp
  const dns = device.services?.dns
  const serviceFacts: Fact[] = [
    ...(dhcp ? [{ label: t('info.dhcpServer'), value: dhcp.enabled ? t('info.pools', { count: dhcp.pools.length }) : t('info.serviceOff') }] : []),
    ...(dns ? [{ label: t('info.dnsServer'), value: dns.enabled ? t('info.serviceOn') : t('info.serviceOff') }] : []),
  ]

  const routing = device.routing
  const visible = {
    host: shows('host'),
    switching: shows('switching'),
    routing: shows('routing'),
    services: shows('services'),
    wireless: shows('wireless'),
    internet: shows('internet'),
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <DeviceVisual kind={device.kind} modelId={device.modelId} className="h-7 w-7 shrink-0" illustrationClassName="-my-1.5 h-10 w-10 shrink-0" aria-hidden="true" />
          <h3 className="min-w-0 truncate font-semibold text-fg-strong">{device.name}</h3>
        </div>
        <FactList facts={general} />
      </section>
      {device.ports.length > 0 && (
        <SettingsSection title={t('info.ports')} icon={EthernetPort}>
          <PortInfoList ports={DeviceInfoModel.ports(state, device, configLocks)} />
        </SettingsSection>
      )}
      {hostFacts.length > 0 && visible.host && (
        <SettingsSection title={t('sections.host')} icon={Globe}>
          <FactList facts={hostFacts} />
        </SettingsSection>
      )}
      {switchingFacts.length > 0 && visible.switching && (
        <SettingsSection title={t('sections.vlans')} icon={Layers}>
          <FactList facts={switchingFacts} />
        </SettingsSection>
      )}
      {routing && visible.routing && (
        <SettingsSection title={t('info.routingTable')} icon={Route}>
          {routing.ipRouting ? (
            <RoutingTableView routes={DeviceInfoModel.routes(state, device)} />
          ) : (
            <p className="text-sm text-fg-subtle">{t('info.routingOff')}</p>
          )}
        </SettingsSection>
      )}
      {serviceFacts.length > 0 && visible.services && (
        <SettingsSection title={t('sections.services')} icon={Server}>
          <FactList facts={serviceFacts} />
        </SettingsSection>
      )}
      {device.wireless && visible.wireless && (
        <SettingsSection title={t('info.ssids')} icon={Wifi}>
          <FactList
            facts={device.wireless.ssids.map((ssid, index) => ({
              label: String(index + 1),
              value: t('info.ssidValue', { ssid: ssid.ssid, vlan: ssid.vlan }),
            }))}
          />
        </SettingsSection>
      )}
      {device.internet && visible.internet && (
        <SettingsSection title={t('info.internetLines')} icon={Cloud}>
          <FactList
            facts={InternetServiceModel.serviceLines(device).map((line) => ({
              label: line.portId,
              value: line.serviceUp ? t('info.lineUp') : t('info.lineDown'),
            }))}
          />
        </SettingsSection>
      )}
    </div>
  )
}

export default DeviceInfoPanel
