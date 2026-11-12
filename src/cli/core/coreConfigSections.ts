// Running-config output of the core commands: version / service, hostname, enable, domain lookup, banner,
// lines, and the generic interface lines (description, speed / duplex, shutdown).
import type { Device, LineSettings } from '../../domain'
import type { CliInterface, InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { CliPrompt, managementOf } from './CliPrompt'
import { PasswordEncoding } from './PasswordEncoding'

/** Banner delimiter as IOS prints it. */
export const BANNER_DELIMITER = '^C'

function isRouterPlatform(device: Device): boolean {
  return device.kind === 'router' || device.kind === 'wirelessRouter'
}

function passwordLine(prefix: string, password: string, encrypted: boolean): string {
  return encrypted ? `${prefix} 7 ${PasswordEncoding.type7(password)}` : `${prefix} ${password}`
}

/** `transport input …` as IOS writes it (telnet before ssh); absent = all, the default, not written. */
function transportLine(transports: LineSettings['transportInput']): string[] {
  if (transports === undefined) return []
  if (transports.length === 0) return [' transport input none']
  return [` transport input ${(['telnet', 'ssh'] as const).filter((name) => transports.includes(name)).join(' ')}`]
}

/**
 * Lines of one `line …` block (IOS order: access-class, exec-timeout, password, logging synchronous,
 * login / login local, transport input).
 */
function lineBody(settings: LineSettings, loginByDefault: boolean, encrypted: boolean): string[] {
  const lines: string[] = []
  if (settings.accessClass?.in !== undefined) lines.push(` access-class ${settings.accessClass.in} in`)
  if (settings.accessClass?.out !== undefined) lines.push(` access-class ${settings.accessClass.out} out`)
  const timeout = settings.execTimeout
  if (timeout !== undefined && (timeout.minutes !== 10 || timeout.seconds !== 0)) lines.push(` exec-timeout ${timeout.minutes} ${timeout.seconds}`)
  if (settings.password !== undefined) lines.push(` ${passwordLine('password', settings.password, encrypted)}`)
  if (settings.loggingSynchronous === true) lines.push(' logging synchronous')
  if (settings.loginLocal === true) lines.push(' login local')
  else if (settings.login ?? loginByDefault) lines.push(' login')
  lines.push(...transportLine(settings.transportInput))
  return lines
}

const versionSection: RunningConfigSection = {
  id: 'version',
  order: RUNNING_CONFIG_ORDER.version,
  blocks: (device) => [
    [
      `version ${isRouterPlatform(device) ? '15.1' : '12.2'}`,
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      managementOf(device).passwordEncryption === true ? 'service password-encryption' : 'no service password-encryption',
    ],
  ],
}

const hostnameSection: RunningConfigSection = {
  id: 'hostname',
  order: RUNNING_CONFIG_ORDER.hostname,
  blocks: (device) => [[`hostname ${CliPrompt.hostname(device)}`]],
}

const enableSection: RunningConfigSection = {
  id: 'enable',
  order: RUNNING_CONFIG_ORDER.enable,
  blocks: (device) => {
    const management = managementOf(device)
    const lines: string[] = []
    if (management.enableSecret !== undefined) lines.push(`enable secret 5 ${PasswordEncoding.secret5(management.enableSecret)}`)
    if (management.enablePassword !== undefined) {
      lines.push(passwordLine('enable password', management.enablePassword, management.passwordEncryption === true))
    }
    return [lines]
  },
}

const domainLookupSection: RunningConfigSection = {
  id: 'domainLookup',
  order: RUNNING_CONFIG_ORDER.ipGlobal,
  blocks: (device) => [managementOf(device).domainLookup === false ? ['no ip domain-lookup'] : []],
}

const bannerSection: RunningConfigSection = {
  id: 'banner',
  order: RUNNING_CONFIG_ORDER.banner,
  blocks: (device) => {
    const banner = managementOf(device).bannerMotd
    if (banner === undefined) return []
    const lines = banner.split('\n')
    if (lines.length === 1) return [[`banner motd ${BANNER_DELIMITER}${banner}${BANNER_DELIMITER}`]]
    return [[`banner motd ${BANNER_DELIMITER}`, ...lines, BANNER_DELIMITER]]
  },
}

const linesSection: RunningConfigSection = {
  id: 'lines',
  order: RUNNING_CONFIG_ORDER.lines,
  blocks: (device) => {
    const management = managementOf(device)
    const encrypted = management.passwordEncryption === true
    const vty = lineBody(management.lines?.vty ?? {}, true, encrypted)
    const blocks: string[][] = [['line con 0', ...lineBody(management.lines?.console ?? {}, false, encrypted)]]
    if (isRouterPlatform(device)) blocks.push(['line aux 0'])
    blocks.push(isRouterPlatform(device) ? ['line vty 0 4', ...vty] : ['line vty 0 4', ...vty, 'line vty 5 15', ...vty])
    return blocks
  },
}

function adminUpOf(iface: CliInterface): boolean {
  switch (iface.kind) {
    case 'port':
      return iface.port.adminUp
    case 'subInterface':
      return iface.sub.adminUp
    case 'svi':
      return iface.svi.adminUp
  }
}

function descriptionOf(iface: CliInterface): string | undefined {
  switch (iface.kind) {
    case 'port':
      return iface.port.description
    case 'subInterface':
      return iface.sub.description
    case 'svi':
      return iface.svi.description
  }
}

const descriptionLines: InterfaceConfigContributor = {
  id: 'description',
  order: INTERFACE_LINE_ORDER.description,
  lines: (_device, iface) => {
    const description = descriptionOf(iface)
    return description === undefined ? [] : [`description ${description}`]
  },
}

/** Routers always list duplex / speed of Ethernet ports; switches only when not auto. */
const physicalLines: InterfaceConfigContributor = {
  id: 'physical',
  order: INTERFACE_LINE_ORDER.physical,
  lines: (device, iface) => {
    if (iface.kind !== 'port' || iface.port.medium === 'serial') return []
    const duplex = iface.port.duplex ?? 'auto'
    const speed = iface.port.speed ?? 'auto'
    const always = iface.port.role === 'routed' && isRouterPlatform(device)
    return [...(always || duplex !== 'auto' ? [`duplex ${duplex}`] : []), ...(always || speed !== 'auto' ? [`speed ${speed}`] : [])]
  },
}

const shutdownLines: InterfaceConfigContributor = {
  id: 'shutdown',
  order: INTERFACE_LINE_ORDER.shutdown,
  lines: (_device, iface) => (adminUpOf(iface) ? [] : ['shutdown']),
}

export const coreConfigSections: readonly RunningConfigSection[] = [
  versionSection,
  hostnameSection,
  enableSection,
  domainLookupSection,
  bannerSection,
  linesSection,
]

export const coreInterfaceLines: readonly InterfaceConfigContributor[] = [descriptionLines, physicalLines, shutdownLines]
