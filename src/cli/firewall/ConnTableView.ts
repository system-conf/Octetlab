// `show conn [all | count | detail]` over the firewall connection table (env.runtime, agent A).
// Row format verified from published sample output
// (https://www.tunnelsup.com/understanding-cisco-asa-connection-flags/):
//   "TCP VPN 77.66.55.44:30031 inside 10.20.20.20:51716, idle 0:00:11, bytes 0, flags U"
//   "UDP VPN 10.17.17.17:8500 inside 10.20.20.20:4167, idle 0:01:38, bytes 616, flags -"
// The header "N in use" is printed without the "M most used" peak, which the runtime does not keep.
// Lab mappings (UNVERIFIED): the lower-security side is printed first (responder first on a tie); flags are
// 'aA' while the SYN waits, 'UIO' when established, 'UfIO' after a FIN, '-' for UDP / ICMP; the `detail`
// layout is a lab rendering. Expired rows (expiresAt <= now) are hidden: expiry is lazy (§5.2).
import type { Device } from '../../domain'
import type { DeviceRuntime } from '../../sim/contract'
import type { FirewallConnection, FirewallConnectionState } from '../../sim/contract/FirewallRuntime'
import { ConnectionTable } from '../../sim/policy/firewall/ConnectionTable'
import { FirewallRuntime } from '../../sim/policy/firewall/FirewallRuntime'
import { DEFAULT_TIMEOUTS, FirewallClock } from './FirewallClock'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces } from './FirewallInterfaces'

export type ConnFormat = 'brief' | 'count' | 'detail'

const MS_PER_SECOND = 1000

const FLAGS: Readonly<Record<FirewallConnectionState, string>> = { synSent: 'aA', established: 'UIO', halfClosed: 'UfIO', open: '-' }

interface Side {
  readonly nameif: string
  readonly ip: string
  readonly port: number
}

/** '1h2m3s' / '5s' (detail lines). */
function shortDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const parts = [hours > 0 ? `${hours}h` : '', hours > 0 || minutes > 0 ? `${minutes}m` : '', `${total % 60}s`]
  return parts.join('')
}

export class ConnTableView {
  static alive(runtime: DeviceRuntime | undefined, now: number): FirewallConnection[] {
    return ConnectionTable.alive(FirewallRuntime.stored(runtime), now)
  }

  static lines(device: Device, runtime: DeviceRuntime | undefined, now: number, format: ConnFormat): string[] {
    const rows = ConnTableView.alive(runtime, now)
    const header = `${rows.length} in use`
    if (format === 'count') return [header]
    return [header, ...rows.flatMap((row) => (format === 'detail' ? ConnTableView.detail(device, row, now) : [ConnTableView.brief(device, row, now)]))]
  }

  private static brief(device: Device, row: FirewallConnection, now: number): string {
    const [first, second] = ConnTableView.sides(device, row)
    const idle = FirewallClock.formatMs(now - row.lastUsedAt)
    return `${row.protocol.toUpperCase()} ${first.nameif} ${first.ip}:${first.port} ${second.nameif} ${second.ip}:${second.port}, idle ${idle}, bytes ${row.bytes}, flags ${FLAGS[row.state]}`
  }

  private static detail(device: Device, row: FirewallConnection, now: number): string[] {
    const [first, second] = ConnTableView.sides(device, row)
    const idle = shortDuration((now - row.lastUsedAt) / MS_PER_SECOND)
    const uptime = shortDuration((now - row.createdAt) / MS_PER_SECOND)
    const timeout = shortDuration(ConnTableView.timeoutOf(device, row))
    return [
      `${row.protocol.toUpperCase()} ${first.nameif}: ${first.ip}/${first.port} ${second.nameif}: ${second.ip}/${second.port},`,
      `    flags ${FLAGS[row.state]}, idle ${idle}, uptime ${uptime}, timeout ${timeout}, bytes ${row.bytes}`,
    ]
  }

  private static timeoutOf(device: Device, row: FirewallConnection): number {
    const timeouts = { ...DEFAULT_TIMEOUTS, ...FirewallEdits.settingsOf(device).timeouts }
    if (row.protocol === 'udp') return timeouts.udp
    if (row.protocol === 'icmp') return timeouts.icmp
    return row.state === 'halfClosed' ? timeouts.halfClosed : timeouts.tcp
  }

  /** [printed first, printed second]: lower security level first; on a tie the responder first. */
  private static sides(device: Device, row: FirewallConnection): readonly [Side, Side] {
    const initiator: Side = { nameif: row.inInterface, ...row.initiator }
    const responder: Side = { nameif: row.outInterface, ...row.responder }
    const level = (nameif: string): number => FirewallInterfaces.byName(device, nameif)?.level ?? 0
    return level(initiator.nameif) < level(responder.nameif) ? [initiator, responder] : [responder, initiator]
  }
}
