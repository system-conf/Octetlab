// The firewall slots of a device's runtime (docs/FIREWALL_PACK.md §5.2): the connection table and the
// created / denied / expired counters in `runtime.extensions`. Expiry is lazy on the virtual clock, like
// NatRuntime: every read drops (and counts) the entries whose `expiresAt` has passed. `clear` is wired to
// `clear conn` (Ipv4NetworkLayer.onRequest).
import type { DeviceContext, DeviceRuntime } from '../../contract'
import type { FirewallConnection, FirewallStatistics } from '../../contract/FirewallRuntime'
import { ConnectionTable } from './ConnectionTable'

const NO_STATISTICS: FirewallStatistics = { created: 0, denied: 0, expired: 0 }

export interface FirewallState {
  readonly connections: readonly FirewallConnection[]
  readonly statistics: FirewallStatistics
}

export class FirewallRuntime {
  /** Connections stored in `runtime`, without the expiry sweep. */
  static stored(runtime: DeviceRuntime | undefined): readonly FirewallConnection[] {
    return runtime?.extensions?.firewallConnections ?? []
  }

  static statistics(runtime: DeviceRuntime | undefined): FirewallStatistics {
    return runtime?.extensions?.firewallStatistics ?? NO_STATISTICS
  }

  /** The state at `ctx.now`; expired entries are removed (and counted) in the runtime. */
  static read(ctx: DeviceContext): FirewallState {
    const stored = FirewallRuntime.stored(ctx.runtime)
    const statistics = FirewallRuntime.statistics(ctx.runtime)
    const alive = ConnectionTable.alive(stored, ctx.now)
    const expired = stored.length - alive.length
    if (expired === 0) return { connections: stored, statistics }
    const next = { connections: alive, statistics: { ...statistics, expired: statistics.expired + expired } }
    FirewallRuntime.write(ctx, next)
    return next
  }

  static write(ctx: DeviceContext, state: FirewallState): void {
    ctx.updateRuntime((runtime) => ({
      ...runtime,
      extensions: { ...runtime.extensions, firewallConnections: state.connections, firewallStatistics: state.statistics },
    }))
  }

  /** One more packet dropped by the firewall. */
  static countDenied(ctx: DeviceContext): void {
    const state = FirewallRuntime.read(ctx)
    FirewallRuntime.write(ctx, { ...state, statistics: { ...state.statistics, denied: state.statistics.denied + 1 } })
  }

  /**
   * `clear conn`: removes every live connection and returns how many (the ones `show conn` listed);
   * entries that had already idled out count as expired, not as cleared. The counters stay.
   */
  static clear(ctx: DeviceContext): number {
    const state = FirewallRuntime.read(ctx)
    const removed = state.connections.length
    if (removed > 0) FirewallRuntime.write(ctx, { ...state, connections: [] })
    return removed
  }
}
