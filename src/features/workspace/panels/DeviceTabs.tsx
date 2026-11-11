import { useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../../domain/Messages'
import type { Device, NetworkState, TerminalLine } from '../../../domain'
// CI (CLI integration): the CLI and Config tabs of IOS devices.
import { CliDevicePanel } from '../../cli'
import AppLinkStatusList from '../../device/AppLinkStatusList'
import TerminalTab from '../../device/TerminalTab'
import { DeviceConfigPanel, DeviceInfoPanel } from '../../deviceConfig'
import { PhysicalTab } from '../../devicePanel'
import { focusRing } from '../../shared/focusRing'
import { appLinkStatusOf, type ExerciseLockPolicy } from '../labServices'
import { availableDeviceTabs, type DeviceTab } from './deviceTabModel'

export interface DeviceTerminalProps {
  lines: readonly TerminalLine[]
  hiddenCount: number
  onRun: (commandLine: string) => void
  onClear: () => void
}

interface DeviceTabsProps {
  /** CI (CLI integration): storage id of the open lab; the CLI keeps one console per device of it. */
  labId: string
  device: Device
  state: NetworkState
  policy: ExerciseLockPolicy
  tab: DeviceTab
  onTab: (tab: DeviceTab) => void
  /** Why the last settings change was refused (LabEditor.deviceUpdateProblems); [] = none. */
  problems: readonly LocalizedMessage[]
  onUpdate: (next: Device) => void
  /** null: the device has no command prompt (or the exercise locks it). */
  terminal: DeviceTerminalProps | null
}

/** Physical / Info / Settings / Terminal of the selected device (accessible tab pattern, arrow keys move). */
function DeviceTabs(props: DeviceTabsProps) {
  const { device, state, policy, tab, onTab, terminal } = props
  const { t } = useTranslation(['workspace', 'device', 'cli'])
  const baseId = useId()
  const tabRefs = useRef(new Map<DeviceTab, HTMLButtonElement>())
  const tabs = availableDeviceTabs(device, policy, terminal !== null)
  const active = tabs.includes(tab) ? tab : 'info'
  const tabId = (value: DeviceTab) => `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel`

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.indexOf(active)
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    let next: DeviceTab | undefined
    if (step !== undefined) next = tabs[(index + step + tabs.length) % tabs.length]
    else if (event.key === 'Home') next = tabs[0]
    else if (event.key === 'End') next = tabs[tabs.length - 1]
    if (next === undefined) return
    event.preventDefault()
    onTab(next)
    tabRefs.current.get(next)?.focus()
  }

  let panel
  if (active === 'physical') {
    // Front panel; its power switch goes through onUpdate like the Settings tab's power button.
    panel = <PhysicalTab key={device.id} device={device} state={state} policy={policy} onUpdate={props.onUpdate} />
  } else if (active === 'settings') {
    panel = (
      <DeviceConfigPanel
        device={device}
        state={state}
        onChange={props.onUpdate}
        problems={props.problems}
        policy={policy}
        readOnly={policy.deviceAccess(device.id) === 'readOnly'}
      />
    )
  } else if (active === 'cli' || active === 'config') {
    // CI (CLI integration): changes go through onUpdate like the Settings tab (same locks, undo).
    panel = (
      <CliDevicePanel tab={active} labId={props.labId} device={device} network={state} policy={policy} onUpdate={props.onUpdate} problems={props.problems} />
    )
  } else if (active === 'terminal' && terminal !== null) {
    panel = (
      <TerminalTab lines={[...terminal.lines]} hiddenLineCount={terminal.hiddenCount} onRunCommand={terminal.onRun} onClear={terminal.onClear} />
    )
  } else {
    const appLinks = device.host && policy.sectionAccess(device.id, 'host') !== 'hidden' ? appLinkStatusOf(state, device.id) : []
    panel = (
      <div className="flex flex-col gap-3">
        {appLinks.length > 0 && (
          <section aria-labelledby={`${baseId}-applinks`} className="flex flex-col gap-1.5">
            <h4 id={`${baseId}-applinks`} className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {t('device:sections.appLinks')}
            </h4>
            <AppLinkStatusList statuses={appLinks} />
          </section>
        )}
        <DeviceInfoPanel device={device} state={state} policy={policy} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={t('properties.tabsLabel')} onKeyDown={handleKeyDown} className="flex gap-1 rounded-lg bg-surface-muted p-1">
        {tabs.map((value) => (
          <button
            key={value}
            ref={(element) => {
              if (element) tabRefs.current.set(value, element)
              else tabRefs.current.delete(value)
            }}
            id={tabId(value)}
            type="button"
            role="tab"
            aria-selected={value === active}
            aria-controls={panelId}
            tabIndex={value === active ? 0 : -1}
            onClick={() => onTab(value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
              value === active ? 'bg-surface text-fg-strong shadow-sm' : 'text-fg-muted hover:text-fg-strong'
            } ${focusRing}`}
          >
            {/* CI (CLI integration): the CLI tabs are named in the cli namespace. */}
            {value === 'cli' || value === 'config' ? t(`cli:ui.tabs.${value}`) : t(`properties.tabs.${value}`)}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)}>
        {panel}
      </div>
    </div>
  )
}

export default DeviceTabs
