// Test-only (O3): runs every §10.2 comparison on one lab (sources = end devices, targets = every address
// in the lab plus a public address and an address only a routing loop leads to) and groups mismatches.
import type { NetworkState } from '../../domain'
import { DeviceAddresses, HostAttachment, Topology } from '../../engine'
import { Divergences } from './Divergences'
import { type Mismatch, OracleChecks, type OracleTally } from './OracleChecks'
import { TerminalChecks } from './TerminalChecks'

/** One group of comparisons (pingPath / pingReason belong to 'ping', appLinkReason to 'appLink'). */
export type CheckKind = 'ping' | 'tracert' | 'resolve' | 'renew' | 'appLink' | 'terminal'

export const CHECK_KINDS: readonly CheckKind[] = ['ping', 'tracert', 'resolve', 'renew', 'appLink', 'terminal']

/** Names every host looks up: a public name, a local record, an unknown name. */
const NAMES = ['google.com', 'intranet.local', 'nothing.example']
/** Addresses outside the lab: the internet, and 10.200/16 (only 'loop' routes lead there). */
const EXTRA_TARGETS = ['8.8.8.8', '10.200.0.1']
/** Fields that classify a result (see signature). */
const SHAPE_KEYS = ['ok', 'reason', 'kind', 'aborted', 'reach', 'outcome', 'echo']

export class OracleRunner {
  /** Every mismatch of the chosen kinds on `state` (fresh simulator per request). */
  static check(state: NetworkState, tally: OracleTally, kinds: readonly CheckKind[] = CHECK_KINDS): Mismatch[] {
    // The rule engine knows no firewall appliance (§10.3.8) and no ACL / NAT (§10.3.7): such a lab is
    // skipped as a whole, never compared.
    if (Divergences.firewall(state)) {
      tally.skip('firewall')
      return []
    }
    if (Divergences.securityPolicies(state)) {
      tally.skip('securityPolicies')
      return []
    }
    const checks = new OracleChecks(state, tally)
    const terminal = new TerminalChecks(state, checks.sim, tally)
    const topology = Topology.of(state)
    const sources = state.devices.filter((device) => device.host !== undefined)
    const targets = [...new Set([...state.devices.flatMap((device) => DeviceAddresses.of(device).slice(0, 1)), ...EXTRA_TARGETS])]
    const found: Mismatch[] = []
    sources.forEach((source, sourceIndex) => {
      if (kinds.includes('ping')) for (const target of targets) found.push(...checks.ping(source.id, target))
      if (kinds.includes('tracert')) {
        // Tracert is long (30 hops × 3 probes): two targets per source, rotating through the list.
        for (const target of [targets[sourceIndex % targets.length], '8.8.8.8']) if (target !== undefined) found.push(...checks.tracert(source.id, target))
      }
      if (kinds.includes('resolve')) for (const name of NAMES) found.push(...checks.resolve(source.id, name))
      const dhcpClient = HostAttachment.activeNics(topology, source).some((nic) => nic.addressing === 'dhcp')
      if (kinds.includes('renew') && dhcpClient) found.push(...checks.renew(source.id))
      if (kinds.includes('appLink')) found.push(...checks.appLinks(source.id))
      if (kinds.includes('terminal') && TerminalChecks.hasTerminal(state, source.id)) {
        const picked = [targets[sourceIndex % targets.length], targets[(sourceIndex + 1) % targets.length]].filter((target) => target !== undefined)
        for (const line of TerminalChecks.script(picked)) found.push(...terminal.check(source.id, line))
      }
    })
    return found
  }

  /** Mismatches with the same signature are the same disagreement (one example each in the report). */
  static signature(mismatch: Mismatch): string {
    return `${mismatch.property}: engine ${OracleRunner.shape(mismatch.engine)} / sim ${OracleRunner.shape(mismatch.sim)}`
  }

  /** Outcome fields of a result, without addresses (tracert lines: hop counts). */
  private static shape(value: unknown): string {
    if (typeof value === 'string') {
      return value.replace(/\d+\.\d+\.\d+\.\d+/g, 'ip').replace(/(ip ?)+/g, (run) => `${run.trim().split(' ').length}ip `).trim()
    }
    if (Array.isArray(value)) return `[${value.map((item) => OracleRunner.shape(item)).join(',')}]`
    if (typeof value !== 'object' || value === null) return String(value)
    const record = value as Record<string, unknown>
    const parts = SHAPE_KEYS.filter((key) => key in record).map((key) => {
      const field = record[key]
      return typeof field === 'object' && field !== null ? `${key}{${OracleRunner.shape(field)}}` : `${key}=${String(field)}`
    })
    return parts.length > 0 ? parts.join(',') : 'network'
  }
}
