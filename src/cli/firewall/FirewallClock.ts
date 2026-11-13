// The appliance's `h:mm:ss` durations (`timeout conn 1:00:00`, `idle 0:00:03`): hours unpadded, minutes and
// seconds two digits (format of the verified default timeouts, docs/FIREWALL_PACK.md §3).
import type { FirewallTimeouts } from '../../domain'

const MS_PER_SECOND = 1000
const CLOCK = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/

/** Longest timeout the lab schema accepts: one week (firewallSchemas.ts). */
export const MAX_TIMEOUT_SECONDS = 604_800

/** Defaults in seconds (D10). */
export const DEFAULT_TIMEOUTS: Readonly<Required<FirewallTimeouts>> = { tcp: 3600, halfClosed: 600, udp: 120, icmp: 2 }

export class FirewallClock {
  /** '1:00:00' → 3600; null when the text is not h:mm:ss or exceeds the lab limit. */
  static parse(text: string): number | null {
    const match = CLOCK.exec(text)
    if (match === null) return null
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    return seconds <= MAX_TIMEOUT_SECONDS ? seconds : null
  }

  static format(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds))
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
    return `${Math.floor(total / 3600)}:${minutes}:${String(total % 60).padStart(2, '0')}`
  }

  static formatMs(ms: number): string {
    return FirewallClock.format(ms / MS_PER_SECOND)
  }
}
