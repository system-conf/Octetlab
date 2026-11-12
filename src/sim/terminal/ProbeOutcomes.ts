import type { PingOutcome } from '../../engine/PingFormatter'
import { ReplyTimings } from '../../engine/ReplyTimings'
import type { TracertEnding, TracertHop } from '../../engine/TracertFormatter'
import type { EchoResult, SimEvent, TracertHopResult, TracertResult } from '../contract'

/** Layer-3 actions of a device that routed a packet (a router waiting for ARP buffers, then sends). */
const ROUTED_ACTIONS: ReadonlySet<SimEvent['action']> = new Set(['forwarded', 'buffered', 'sent'])

/** Hop lines and ending of a tracert, in the shape the engine's TracertFormatter prints (`null` = silent hop). */
export interface TracertLines {
  readonly hops: readonly (TracertHop | null)[]
  readonly ending: TracertEnding
}

/**
 * Maps the ping and tracert clients' results to the terminal outcomes of the rule engine
 * (docs/SIMULATION.md §10.1). Printed times are derived from the hop count like the engine's
 * (coordinator decision 2), not measured.
 */
export class ProbeOutcomes {
  /** Distinct routers that routed the echo request (forwarded, or buffered / sent at layer 3), without the source. */
  static routers(events: readonly SimEvent[], pduId: string, sourceId: string): number {
    const routers = new Set<string>()
    for (const event of events) {
      if (event.pduId === pduId && event.layer === 3 && event.deviceId !== sourceId && ROUTED_ACTIONS.has(event.action)) {
        routers.add(event.deviceId)
      }
    }
    return routers.size
  }

  static ping(echo: EchoResult, targetIp: string, events: readonly SimEvent[], sourceId: string): PingOutcome {
    switch (echo.kind) {
      case 'reply': {
        const { baseTimeMs } = ReplyTimings.forRouters(targetIp, ProbeOutcomes.routers(events, echo.requestPduId, sourceId))
        return { kind: 'reply', fromIp: echo.fromIp, ttl: echo.ttl, baseTimeMs }
      }
      case 'unreachable':
        // Every code, also 13 (ACL "administratively prohibited", pack 5.2), prints "Destination host
        // unreachable.": the Windows text for code 13 could not be confirmed (SECURITY_PACK.md §7 keeps it).
        return { kind: 'unreachable', fromIp: echo.fromIp }
      case 'ttlExpired':
        return { kind: 'ttlExpired', fromIp: echo.fromIp }
      case 'timeout':
        return { kind: 'timeout' }
      case 'localFailure':
        return { kind: 'generalFailure' }
    }
  }

  /**
   * Hop n (TTL n) prints the first answering probe's address; a router hop answers after n - 1 ms
   * ("<1 ms" for the first), the destination like a ping reply behind n - 1 routers. An unreachable
   * replaces its hop line by the "reports:" line; the trailing silent hops of a `silent` ending are the
   * "Request timed out." lines the formatter prints itself.
   */
  static tracert(result: TracertResult, targetIp: string, maxSilentHops: number): TracertLines {
    const ending = result.ending
    if (ending === null || ending.kind === 'localFailure') return { hops: [], ending: { kind: 'generalFailure' } }
    const hops = [...result.hops].sort((first, second) => first.ttl - second.ttl)
    switch (ending.kind) {
      case 'reached':
        return { hops: hops.map((hop) => ProbeOutcomes.hopLine(hop, targetIp)), ending: { kind: 'complete' } }
      case 'unreachable': {
        const reporter = hops.findIndex((hop) => hop.probes.some((probe) => probe.kind === 'unreachable'))
        const before = reporter < 0 ? hops : hops.slice(0, reporter)
        return { hops: before.map((hop) => ProbeOutcomes.hopLine(hop, targetIp)), ending: { kind: 'unreachable', reporterIp: ending.reporterIp } }
      }
      case 'silent': {
        let answered = hops.length
        for (let silent = 0; silent < maxSilentHops && answered > 0 && ProbeOutcomes.isSilent(hops[answered - 1]); silent += 1) answered -= 1
        return { hops: hops.slice(0, answered).map((hop) => ProbeOutcomes.hopLine(hop, targetIp)), ending: { kind: 'timedOut' } }
      }
      case 'hopLimit':
        return { hops: hops.map((hop) => ProbeOutcomes.hopLine(hop, targetIp)), ending: { kind: 'hopLimit' } }
    }
  }

  private static isSilent(hop: TracertHopResult | undefined): boolean {
    return hop !== undefined && hop.probes.every((probe) => probe.kind === 'timeout')
  }

  private static hopLine(hop: TracertHopResult, targetIp: string): TracertHop | null {
    const answer = hop.probes.find((probe) => probe.kind !== 'timeout')
    if (answer === undefined || !('fromIp' in answer)) return null
    const routersBefore = hop.ttl - 1
    const destination = hop.probes.some((probe) => probe.kind === 'echoReply')
    const baseTimeMs = destination && routersBefore > 0 ? ReplyTimings.forRouters(targetIp, routersBefore).baseTimeMs : routersBefore
    const answered = hop.probes.map((probe) => probe.kind !== 'timeout')
    return { ip: answer.fromIp, baseTimeMs, ...(answered.every(Boolean) ? {} : { answered }) }
  }
}
