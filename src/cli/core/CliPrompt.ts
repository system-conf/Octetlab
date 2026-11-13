// Prompt rendering: 'Router>', 'R1#', 'S1(config-if-range)#'.
import type { Device, ManagementSettings } from '../../domain'
import type { CliMode, CliModeKind } from '../contract'

const MODE_SUFFIXES: Readonly<Record<CliModeKind, string>> = {
  userExec: '>',
  privilegedExec: '#',
  globalConfig: '(config)#',
  interface: '(config-if)#',
  subInterface: '(config-subif)#',
  interfaceRange: '(config-if-range)#',
  line: '(config-line)#',
  vlan: '(config-vlan)#',
  dhcpPool: '(dhcp-config)#',
  router: '(config-router)#',
  // Standard lists; extended lists use EXTENDED_ACL_SUFFIX (the mode carries the type).
  accessList: '(config-std-nacl)#',
  objectNetwork: '(config-network-object)#',
}

const EXTENDED_ACL_SUFFIX = '(config-ext-nacl)#'

/** IOS hostname rule: a letter first, then letters, digits and hyphens, no hyphen at the end. */
export const HOSTNAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

/** The device's management settings, or the factory ones (`{}`). */
export function managementOf(device: Device): ManagementSettings {
  return device.features?.management ?? {}
}

export class CliPrompt {
  /** `hostname`, or the IOS factory name. */
  static hostname(device: Device): string {
    const configured = managementOf(device).hostname
    return configured !== undefined && configured !== '' ? configured : CliPrompt.defaultHostname(device)
  }

  /**
   * Hostname when none is configured: the device's name on the map when it is a valid hostname
   * (sample and exercise devices are called R1, SW1…), else the IOS factory name ('Router' for
   * routers and wireless routers, 'Switch' for switches) — e.g. for "Router 1" with its space.
   */
  static defaultHostname(device: Device): string {
    if (HOSTNAME_PATTERN.test(device.name)) return device.name
    return CliPrompt.factoryHostname(device)
  }

  /** Factory name: 'Firewall' for firewalls, 'Router' for routers and wireless routers, else 'Switch'. */
  static factoryHostname(device: Device): string {
    if (device.kind === 'firewall') return 'Firewall'
    return device.kind === 'router' || device.kind === 'wirelessRouter' ? 'Router' : 'Switch'
  }

  static render(device: Device, mode: CliMode): string {
    const suffix = mode.kind === 'accessList' && mode.listType === 'extended' ? EXTENDED_ACL_SUFFIX : MODE_SUFFIXES[mode.kind]
    return `${CliPrompt.hostname(device)}${suffix}`
  }
}
