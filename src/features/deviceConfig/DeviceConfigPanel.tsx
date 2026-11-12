import { useTranslation } from 'react-i18next'
import { findDeviceModel } from '../../catalog'
import type { Device, NetworkState } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import ProblemList from './fields/ProblemList'
import { ConfigLocks, type ConfigAccess } from './model/ConfigLocks'
import { DeviceSections, LOCK_SECTION_OF, type ConfigSectionId } from './model/DeviceSections'
import AccessListsSection from './sections/acl/AccessListsSection'
import AppLinksSection from './sections/AppLinksSection'
import NatSection from './sections/nat/NatSection'
import SecuritySection from './sections/security/SecuritySection'
import GeneralSection from './sections/GeneralSection'
import HostSection from './sections/HostSection'
import InternetSection from './sections/InternetSection'
import PortsSection from './sections/ports/PortsSection'
import RoutingSection from './sections/RoutingSection'
import DhcpSection from './sections/services/DhcpSection'
import DnsSection from './sections/services/DnsSection'
import SvisSection from './sections/SvisSection'
import VlansSection from './sections/VlansSection'
import WirelessSection from './sections/WirelessSection'
import { useSaveConfirmation } from './useSaveConfirmation'

export interface DeviceConfigPanelProps {
  device: Device
  state: NetworkState
  /** Called with the whole edited device when the user saves a section. Parent applies LabEditor.updateDevice. */
  onChange: (next: Device) => void
  /** Problems from LabEditor.deviceUpdateProblems for the last refused change (shown at top), optional. */
  problems?: readonly LocalizedMessage[]
  /** The exercise's locks (`ExerciseLockPolicy.none` by default); only locks for `device.id` apply. */
  policy?: ExerciseLockPolicy
  readOnly?: boolean
}

/** Remount key of a card: a new draft whenever its saved settings (or the device) change. */
function draftKey(section: ConfigSectionId, device: Device, slice: unknown): string {
  return `${section}:${device.id}:${JSON.stringify(slice) ?? ''}`
}

/**
 * Settings of one device, one card per settings area the device has. Each card edits a local
 * draft and hands the whole edited device to `onChange` on Save; props are never mutated.
 */
function DeviceConfigPanel({ device, state, onChange, problems = [], policy = ExerciseLockPolicy.none, readOnly = false }: DeviceConfigPanelProps) {
  const { t } = useTranslation('deviceConfig')
  const model = findDeviceModel(device.modelId)
  const configLocks = new ConfigLocks(device.id, policy, readOnly)
  const powerAccess = configLocks.section('power')
  const { savedKey, expectSaved } = useSaveConfirmation<ConfigSectionId>(device, problems.length)

  function accessOf(section: ConfigSectionId): ConfigAccess {
    const lockSection = LOCK_SECTION_OF[section]
    return lockSection === null ? configLocks.device() : configLocks.section(lockSection)
  }

  function cardProps(section: ConfigSectionId) {
    return {
      device,
      access: accessOf(section),
      saved: savedKey === section,
      onSave: (next: Device) => {
        expectSaved(section, next)
        onChange(next)
      },
    }
  }

  function renderCard(section: ConfigSectionId) {
    switch (section) {
      case 'general':
        return <GeneralSection key={draftKey(section, device, device.name)} {...cardProps(section)} powerAccess={powerAccess} />
      case 'ports':
        return <PortsSection key={`ports:${device.id}`} {...cardProps(section)} state={state} model={model} locks={configLocks} />
      case 'host':
        return device.host && <HostSection key={draftKey(section, device, [device.host.defaultGateway, device.host.dnsServers])} {...cardProps(section)} host={device.host} />
      case 'appLinks':
        return device.host && <AppLinksSection key={draftKey(section, device, device.host.appLinks)} {...cardProps(section)} host={device.host} />
      case 'vlans':
        return device.switching && <VlansSection key={draftKey(section, device, device.switching.vlans)} {...cardProps(section)} switching={device.switching} />
      case 'svis':
        return (
          device.switching && (
            <SvisSection
              key={draftKey(section, device, [device.switching.svis, device.switching.defaultGateway])}
              {...cardProps(section)}
              switching={device.switching}
            />
          )
        )
      case 'routing':
        return (
          device.routing && (
            <RoutingSection
              key={draftKey(section, device, device.routing)}
              {...cardProps(section)}
              routing={device.routing}
              ipRoutingChoice={device.kind === 'l3Switch'}
            />
          )
        )
      case 'dhcp':
        return <DhcpSection key={draftKey(section, device, device.services?.dhcp)} {...cardProps(section)} />
      case 'dns':
        return <DnsSection key={draftKey(section, device, device.services?.dns)} {...cardProps(section)} />
      case 'wireless':
        return device.wireless && <WirelessSection key={draftKey(section, device, device.wireless)} {...cardProps(section)} wireless={device.wireless} />
      case 'internet':
        return <InternetSection key={draftKey(section, device, [device.internet, device.ports.map((port) => port.id)])} {...cardProps(section)} />
      case 'accessLists':
        return <AccessListsSection key={draftKey(section, device, device.features?.accessLists)} {...cardProps(section)} />
      case 'nat':
        return <NatSection key={draftKey(section, device, device.features?.nat)} {...cardProps(section)} />
      case 'security':
        return <SecuritySection key={draftKey(section, device, device.features?.management)} {...cardProps(section)} />
    }
  }

  const visible = DeviceSections.of(device, model).filter((section) => accessOf(section) !== 'hidden')

  return (
    <div aria-label={t('panel.label')} role="region" className="@container flex min-w-0 flex-col gap-3">
      {problems.length > 0 && <ProblemList problems={problems} />}
      {readOnly && <p className="rounded-md bg-surface-muted p-2 text-xs text-fg-muted">{t('panel.readOnly')}</p>}
      {visible.map((section) => renderCard(section))}
    </div>
  )
}

export default DeviceConfigPanel
