import type { Device } from '../../../domain'
// CI (CLI integration): the device CLI's "CLI" and "Config" tabs.
import { CliAccess, type CliDeviceTab } from '../../cli'
import type { ExerciseLockPolicy } from '../labServices'

export type DeviceTab = 'physical' | 'info' | 'settings' | 'terminal' | CliDeviceTab

/**
 * Tabs available for a device: the front panel (first, like Packet Tracer) and Info on every device,
 * settings unless the exercise hides them, CLI / Config on IOS devices, terminal where there is one.
 */
export function availableDeviceTabs(device: Device, policy: ExerciseLockPolicy, hasTerminal: boolean): DeviceTab[] {
  const tabs: DeviceTab[] = ['physical', 'info']
  if (policy.deviceAccess(device.id) !== 'hidden') tabs.push('settings')
  tabs.push(...CliAccess.tabs(device, policy))
  if (hasTerminal) tabs.push('terminal')
  return tabs
}

/** Tabs that show a console: the properties panel widens for them so 80-column output does not wrap. */
const CONSOLE_TABS: readonly DeviceTab[] = ['cli', 'terminal']

/** True when the tab the device would actually show (unavailable tab → Info) is a console. */
export function showsConsole(device: Device, policy: ExerciseLockPolicy, hasTerminal: boolean, tab: DeviceTab): boolean {
  return CONSOLE_TABS.includes(tab) && availableDeviceTabs(device, policy, hasTerminal).includes(tab)
}
