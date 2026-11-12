// The NAT slots of a device's runtime (docs/SECURITY_PACK.md §5): dynamic translations and the
// hit / miss / expired counters in `runtime.extensions`. Static rules are not stored: they are derived
// from the configuration (NatConfig.staticRows), so an edit takes effect at once. Expiry is lazy on the
// virtual clock, like ARP: every read drops the entries whose `expiresAt` has passed.
import type { DeviceContext, DeviceRuntime } from '../../contract'
import type { NatStatistics, NatTranslation } from '../../contract/SecurityRuntime'

const NO_STATISTICS: NatStatistics = { hits: 0, misses: 0, expired: 0 }

export interface NatState {
  readonly translations: readonly NatTranslation[]
  readonly statistics: NatStatistics
}

export class NatRuntime {
  /** The state stored in `runtime`, without the expiry sweep. */
  static stored(runtime: DeviceRuntime | undefined): NatState {
    return {
      translations: runtime?.extensions?.natTranslations ?? [],
      statistics: runtime?.extensions?.natStatistics ?? NO_STATISTICS,
    }
  }

  /** Entries still alive at `now`. */
  static alive(translations: readonly NatTranslation[], now: number): NatTranslation[] {
    return translations.filter((entry) => entry.expiresAt === null || entry.expiresAt > now)
  }

  /** The state at `ctx.now`; expired entries are removed (and counted) in the runtime. */
  static read(ctx: DeviceContext): NatState {
    const stored = NatRuntime.stored(ctx.runtime)
    const alive = NatRuntime.alive(stored.translations, ctx.now)
    const expired = stored.translations.length - alive.length
    if (expired === 0) return stored
    const next = { translations: alive, statistics: { ...stored.statistics, expired: stored.statistics.expired + expired } }
    NatRuntime.write(ctx, next)
    return next
  }

  static write(ctx: DeviceContext, state: NatState): void {
    ctx.updateRuntime((runtime) => ({
      ...runtime,
      extensions: { ...runtime.extensions, natTranslations: state.translations, natStatistics: state.statistics },
    }))
  }

  /** `clear ip nat translation *`: removes every dynamic entry; returns how many were removed. */
  static clear(ctx: DeviceContext): number {
    const stored = NatRuntime.stored(ctx.runtime)
    const kept = stored.translations.filter((entry) => entry.origin === 'static')
    const removed = stored.translations.length - kept.length
    if (removed > 0) NatRuntime.write(ctx, { ...stored, translations: kept })
    return removed
  }
}
