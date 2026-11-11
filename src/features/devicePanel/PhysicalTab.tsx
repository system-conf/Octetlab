import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { findDeviceModel, useDeviceStyle } from '../../catalog'
import type { Device, NetworkState } from '../../domain'
import { useMessageTranslator } from '../../i18n'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import { ConfigLocks } from '../deviceConfig'
import { focusRing } from '../shared/focusRing'
import type { ColouredCable } from '../shared/cableStyle'
import { FrontPanelLayout } from './model/FrontPanelLayout'
import { PortPanelStatus, type PortPanelState } from './model/PortPanelStatus'
import FrontPanelSvg from './view/FrontPanelSvg'
import PanelLegend from './view/PanelLegend'
import { panelPaletteFor } from './view/panelPalette'
import PortStatusTable from './view/PortStatusTable'
import PortTooltip from './view/PortTooltip'
import { usePortTexts } from './view/usePortTexts'

export interface PhysicalTabProps {
  device: Device
  state: NetworkState
  policy: ExerciseLockPolicy
  /** Applies a changed device (the power switch), like the Settings tab's onChange. */
  onUpdate: (next: Device) => void
}

/** Above this many ports the table lists only the ports in use, with a button for the rest. */
const FULL_TABLE_LIMIT = 8
const SEPARATOR = ' · '

/** Whether the port is worth a table row by default: something is attached or it carries an address. */
function inUse(port: PortPanelState): boolean {
  return port.peers.length > 0 || port.plug !== null || port.detail.kind === 'address'
}

/**
 * "Physical" device tab: the generated front panel (look follows the map's device style), a tooltip
 * per port, the power switch, and a port table that highlights the same port as the panel.
 */
function PhysicalTab({ device, state, policy, onUpdate }: PhysicalTabProps) {
  const { t } = useTranslation(['device', 'catalog'])
  const translate = useMessageTranslator()
  const portTexts = usePortTexts()
  const deviceStyle = useDeviceStyle()
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const model = findDeviceModel(device.modelId)
  const plan = FrontPanelLayout.plan(device, model)
  const palette = panelPaletteFor(deviceStyle)
  const locks = new ConfigLocks(device.id, policy, policy.deviceAccess(device.id) === 'readOnly')
  const ports = PortPanelStatus.of(state, device, locks)
  const byId = new Map(ports.map((port) => [port.portId, port]))
  const canTogglePower = locks.section('power') === 'editable'
  const modelName = model ? translate({ key: model.nameKey }) : t(`catalog:kinds.${device.kind}`)

  const hotPortId = hovered ?? pinned
  const hotPort = hotPortId === null ? undefined : byId.get(hotPortId)
  const listed = showAll || ports.length <= FULL_TABLE_LIMIT ? ports.filter((port) => showAll || port.medium !== 'console' || inUse(port)) : ports.filter(inUse)
  const unlisted = ports.length - listed.length
  const cables = [...new Set(ports.flatMap((port): ColouredCable[] => (port.plug === null ? [] : [port.plug])))]
  const networkPorts = ports.filter((port) => port.medium !== 'console').length
  const attached = ports.filter((port) => port.peers.length > 0).length

  const pin = (portId: string) => setPinned((current) => (current === portId ? null : portId))
  const describe = (portId: string) => {
    const port = byId.get(portId)
    return port ? portTexts(port).summary : portId
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
        <span>
          {t('physical.summary.ports', { count: networkPorts })}
          {SEPARATOR}
          {t('physical.summary.attached', { count: attached })}
        </span>
        {!device.powered && (
          <span className="rounded-md bg-surface-muted px-2 py-0.5 font-medium text-fg-muted">
            {canTogglePower ? t('physical.offHint') : t('physical.off')}
          </span>
        )}
      </p>
      <div className="rounded-xl border border-border bg-surface-muted px-2 pb-2.5">
        <div className="overflow-x-auto pb-1 pt-10">
          <div className="relative mx-auto" style={{ minWidth: plan.minDisplayWidth, maxWidth: Math.round(plan.width * 1.5) }}>
            <FrontPanelSvg
              plan={plan}
              palette={palette}
              states={byId}
              powered={device.powered}
              modelName={modelName}
              label={t('physical.panelLabel', { device: device.name })}
              hotPortId={hotPortId}
              pinnedPortId={pinned}
              describe={describe}
              onHover={setHovered}
              onPin={pin}
              onTogglePower={canTogglePower ? () => onUpdate({ ...device, powered: !device.powered }) : undefined}
            />
            {hotPort && <PortTooltip plan={plan} port={hotPort} texts={portTexts(hotPort)} />}
          </div>
        </div>
      </div>
      <PanelLegend cables={cables} hasConsole={ports.some((port) => port.medium === 'console')} />
      {listed.length > 0 ? (
        <PortStatusTable ports={listed} texts={portTexts} hotPortId={hotPortId} onHover={setHovered} onPin={pin} />
      ) : (
        <p className="text-xs text-fg-subtle">{t('physical.table.noneInUse')}</p>
      )}
      {(unlisted > 0 || showAll) && ports.length > FULL_TABLE_LIMIT && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          className={`self-start rounded-md px-2 py-1 text-xs font-medium text-accent-text hover:bg-surface-muted ${focusRing}`}
        >
          {showAll ? t('physical.table.showUsed') : t('physical.table.showAll', { count: unlisted })}
        </button>
      )}
    </div>
  )
}

export default PhysicalTab
