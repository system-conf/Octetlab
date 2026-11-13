// `show xlate`: the pack 5.2 NAT table (static rows from the configuration + live dynamic rows) in the
// appliance layout. Verified from a published sample
// (https://www.cisco.com/c/nl_nl/support/docs/security/asa-5500-x-series-next-generation-firewalls/115992-long-asa-xlate-idle-values-00.html):
//   "TCP PAT from inside:10.20.33.2/54676 to outside:192.0.2.3/54676 flags ri idle 1:48:12 timeout 0:00:30"
// and the flag legend (community.cisco.com thread 2690254). The "NAT from …" line of a 1:1 entry is printed
// on one line too (two-line layout UNVERIFIED); the header omits "most used" (no peak counter in the runtime).
// Interface names come from the object NAT that covers the inside address, else from the NAT roles.
import type { Device, NatRole } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { DeviceRuntime } from '../../sim/contract'
import type { NatTranslation } from '../../sim/contract/SecurityRuntime'
import { NatConfig } from '../../sim/policy/nat/NatConfig'
import { NatTranslationsView } from '../nat/NatTranslationsView'
import { FirewallClock } from './FirewallClock'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces } from './FirewallInterfaces'

const LEGEND = ['Flags: D - DNS, e - extended, I - identity, i - dynamic, r - portmap,', '       s - static, T - twice, N - net-to-net']

function covers(device: Device, ip: string): { readonly real: string; readonly mapped: string } | undefined {
  for (const object of FirewallEdits.objectsOf(device)) {
    const { address, nat } = object
    if (address === undefined || nat === undefined) continue
    const inside = address.kind === 'host' ? address.address === ip : Ipv4.inNetwork(ip, address.address, address.mask)
    if (inside) return { real: nat.realInterface, mapped: nat.mappedInterface }
  }
  return undefined
}

function roleName(device: Device, role: NatRole): string {
  const id = NatConfig.interfacesWithRole(device, role)[0]
  return (id === undefined ? undefined : FirewallInterfaces.byId(device, id)?.nameif) ?? role
}

function flagsOf(row: NatTranslation): string {
  const ported = row.protocol !== 'any'
  if (row.origin === 'static') return ported ? 'sr' : 's'
  return ported ? 'ri' : 'i'
}

export class XlateView {
  static lines(device: Device, runtime: DeviceRuntime | undefined, now: number): string[] {
    const rows = NatTranslationsView.rows(NatConfig.of(device), runtime, now)
    return [`${rows.length} in use`, ...LEGEND, ...rows.map((row) => XlateView.row(device, row, now))]
  }

  private static row(device: Device, row: NatTranslation, now: number): string {
    const names = covers(device, row.insideLocal.ip) ?? { real: roleName(device, 'inside'), mapped: roleName(device, 'outside') }
    const idle = FirewallClock.formatMs(now - row.lastUsedAt)
    const timeout = row.expiresAt === null ? FirewallClock.format(0) : FirewallClock.formatMs(row.expiresAt - row.lastUsedAt)
    const tail = `flags ${flagsOf(row)} idle ${idle} timeout ${timeout}`
    if (row.protocol === 'any') return `NAT from ${names.real}:${row.insideLocal.ip} to ${names.mapped}:${row.insideGlobal.ip} ${tail}`
    const endpoint = (ip: string, port: number | undefined): string => (port === undefined ? ip : `${ip}/${port}`)
    return `${row.protocol.toUpperCase()} PAT from ${names.real}:${endpoint(row.insideLocal.ip, row.insideLocal.port)} to ${names.mapped}:${endpoint(row.insideGlobal.ip, row.insideGlobal.port)} ${tail}`
  }
}
