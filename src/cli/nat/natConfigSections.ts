// Running-config output of the NAT command set (docs/CLI.md §6). The global lines sit after the
// interface (and routing protocol) blocks and before `ip route`, where IOS writes them; this also means
// startup-config replay has created every sub-interface a `… interface <if> overload` line names.
// Every line is accepted by natGlobalCommands / natInterfaceCommands (round trip in natCommands.test.ts).
import type { NatDynamicRule, NatPool, NatStaticRule } from '../../domain'
import type { InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { InterfaceNames } from '../core/InterfaceNames'

/** Free slot between `router …` blocks (70) and `ip route` (80). */
export const NAT_CONFIG_ORDER = (RUNNING_CONFIG_ORDER.routerProtocols + RUNNING_CONFIG_ORDER.ipRoutes) / 2

function poolLine(pool: NatPool): string {
  return `ip nat pool ${pool.name} ${pool.start} ${pool.end} netmask ${pool.netmask}`
}

function dynamicLine(rule: NatDynamicRule): string {
  const target = rule.target.kind === 'pool' ? `pool ${rule.target.poolName}` : `interface ${InterfaceNames.longName(rule.target.interfaceId)}`
  return `ip nat inside source list ${rule.aclName} ${target}${rule.overload ? ' overload' : ''}`
}

function staticLine(rule: NatStaticRule): string {
  if (rule.protocol !== undefined && rule.insideLocalPort !== undefined && rule.insideGlobalPort !== undefined) {
    return `ip nat inside source static ${rule.protocol} ${rule.insideLocal} ${rule.insideLocalPort} ${rule.insideGlobal} ${rule.insideGlobalPort}`
  }
  return `ip nat inside source static ${rule.insideLocal} ${rule.insideGlobal}`
}

const natSection: RunningConfigSection = {
  id: 'natGlobal',
  order: NAT_CONFIG_ORDER,
  blocks: (device) => {
    // Firewalls express NAT only as object nat (src/cli/firewall, slot 87): `ip nat` does not exist there,
    // so these lines would not replay (CLI.md §5.3).
    const nat = device.kind === 'firewall' ? undefined : device.features?.nat
    if (nat === undefined) return []
    return [[...nat.pools.map(poolLine), ...nat.dynamics.map(dynamicLine), ...nat.statics.map(staticLine)]]
  },
}

const natRoleLines: InterfaceConfigContributor = {
  id: 'natRole',
  order: INTERFACE_LINE_ORDER.features,
  lines: (device, iface) => {
    if (device.kind === 'firewall') return []
    const l3 = iface.kind === 'port' ? (iface.port.role === 'routed' ? iface.port.l3 : undefined) : iface.kind === 'subInterface' ? iface.sub.l3 : iface.svi.l3
    const role = l3?.features?.natRole
    return role === undefined ? [] : [`ip nat ${role}`]
  },
}

export const natConfigSections: readonly RunningConfigSection[] = [natSection]
export const natInterfaceLines: readonly InterfaceConfigContributor[] = [natRoleLines]
