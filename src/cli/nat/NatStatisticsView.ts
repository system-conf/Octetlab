// `show ip nat statistics` (IOS NAT monitoring guide, 15.2S, iadnat-monmain). The `[Id:]`, `Peak`, `CEF`
// lines and the per-pool `misses` are not shown: the lab keeps only device-wide counters.
import type { Device, NatDynamicRule, NatSettings } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { DeviceRuntime } from '../../sim/contract'
import type { NatTranslation } from '../../sim/contract/SecurityRuntime'
import { NatConfig } from '../../sim/policy/nat/NatConfig'
import { NatRuntime } from '../../sim/policy/nat/NatRuntime'
import { InterfaceNames } from '../core/InterfaceNames'
import { NatTranslationsView } from './NatTranslationsView'

const PERCENT = 100

function interfaces(device: Device, role: 'inside' | 'outside'): string {
  return NatConfig.interfacesWithRole(device, role).map((id) => InterfaceNames.longName(id)).join(', ')
}

/** Dynamic rows a mapping created: global address in its pool, or its interface's address. */
function rowsOf(device: Device, nat: NatSettings, rule: NatDynamicRule, rows: readonly NatTranslation[]): NatTranslation[] {
  const dynamic = rows.filter((row) => row.origin === 'dynamic')
  if (rule.target.kind === 'interface') {
    const address = NatConfig.addressOf(device, rule.target.interfaceId)
    return dynamic.filter((row) => address !== '' && row.insideGlobal.ip === address)
  }
  const poolName = rule.target.poolName
  const pool = nat.pools.find((candidate) => candidate.name === poolName)
  if (pool === undefined) return []
  const addresses = new Set(Ipv4.range(pool.start, pool.end))
  return dynamic.filter((row) => addresses.has(row.insideGlobal.ip))
}

function mappingLines(device: Device, nat: NatSettings, rule: NatDynamicRule, rows: readonly NatTranslation[]): string[] {
  const used = rowsOf(device, nat, rule, rows)
  if (rule.target.kind === 'interface') {
    return [`access-list ${rule.aclName} interface ${InterfaceNames.longName(rule.target.interfaceId)} refcount ${used.length}`]
  }
  const poolName = rule.target.poolName
  const head = `access-list ${rule.aclName} pool ${poolName} refcount ${used.length}`
  const pool = nat.pools.find((candidate) => candidate.name === poolName)
  if (pool === undefined) return [head]
  const total = NatConfig.poolAddresses(device, pool).length
  const allocated = new Set(used.map((row) => row.insideGlobal.ip)).size
  const percent = total === 0 ? 0 : Math.floor((allocated * PERCENT) / total)
  return [
    head,
    ` pool ${pool.name}: netmask ${pool.netmask}`,
    `        start ${pool.start} end ${pool.end}`,
    `        type generic, total addresses ${total}, allocated ${allocated} (${percent}%)`,
  ]
}

export class NatStatisticsView {
  static lines(device: Device, runtime: DeviceRuntime | undefined, now: number): string[] {
    const nat = NatConfig.of(device)
    const rows = NatTranslationsView.rows(nat, runtime, now)
    const statics = rows.filter((row) => row.origin === 'static').length
    const extended = rows.filter((row) => row.protocol !== 'any').length
    const { statistics, translations } = NatRuntime.stored(runtime)
    // Entries past their time count as expired at once (lazy expiry, like the simulator's next read).
    const expired = statistics.expired + translations.length - NatRuntime.alive(translations, now).length
    return [
      `Total translations: ${rows.length} (${statics} static, ${rows.length - statics} dynamic; ${extended} extended)`,
      `Outside interfaces: ${interfaces(device, 'outside')}`.trimEnd(),
      `Inside interfaces: ${interfaces(device, 'inside')}`.trimEnd(),
      `Hits: ${statistics.hits}  Misses: ${statistics.misses}`,
      `Expired translations: ${expired}`,
      'Dynamic mappings:',
      ...(nat === undefined || nat.dynamics.length === 0 ? [] : ['-- Inside Source', ...nat.dynamics.flatMap((rule) => mappingLines(device, nat, rule, rows))]),
    ]
  }
}
