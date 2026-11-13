// The connection table of the stateful firewall (docs/FIREWALL_PACK.md §5.1, §5.2) as pure functions over
// an immutable list: lookup of a packet's flow in either direction on the real 5-tuple, creation, the
// TCP state machine (SYN → synSent, SYN+ACK back → established, FIN → halfClosed, RST → removed) and the
// idle refresh. Expiry is lazy on the virtual clock: `alive` keeps the entries whose `expiresAt` is ahead.
import type { FirewallConnection, FirewallConnectionState, FirewallEndpoint } from '../../contract/FirewallRuntime'
import type { FirewallTimeoutsMs } from './FirewallConfig'
import type { FirewallFlow } from './FirewallFlows'

/** `forward` = the packet goes initiator → responder; `reverse` = it is the answer. */
export type ConnectionDirection = 'forward' | 'reverse'

export interface ConnectionMatch {
  readonly connection: FirewallConnection
  readonly direction: ConnectionDirection
}

/** What a new entry needs besides its flow. */
export interface ConnectionOrigin {
  readonly id: number
  readonly inInterface: string
  readonly outInterface: string
  readonly now: number
  readonly bytes: number
}

/** A configured idle timeout of 0 never expires (stored as the largest safe time, JSON-friendly). */
const NEVER = Number.MAX_SAFE_INTEGER

function same(a: FirewallEndpoint, b: FirewallEndpoint): boolean {
  return a.ip === b.ip && a.port === b.port
}

function directionOf(connection: FirewallConnection, flow: FirewallFlow): ConnectionDirection | null {
  if (connection.protocol !== flow.protocol) return null
  if (same(connection.initiator, flow.src) && same(connection.responder, flow.dst)) return 'forward'
  if (same(connection.initiator, flow.dst) && same(connection.responder, flow.src)) return 'reverse'
  return null
}

function expiry(now: number, timeout: number | null): number {
  return timeout === null ? NEVER : now + timeout
}

function idleTimeout(protocol: FirewallConnection['protocol'], state: FirewallConnectionState, timeouts: FirewallTimeoutsMs): number | null {
  switch (protocol) {
    case 'tcp':
      return state === 'halfClosed' ? timeouts.halfClosed : timeouts.tcp
    case 'udp':
      return timeouts.udp
    case 'icmp':
      return timeouts.icmp
  }
}

/** The TCP state after a segment of `flow`; null = RST, the entry goes. */
function nextTcpState(current: FirewallConnectionState, flow: FirewallFlow, direction: ConnectionDirection): FirewallConnectionState | null {
  const flags = flow.tcpFlags
  if (flags.includes('rst')) return null
  if (flags.includes('fin') || current === 'halfClosed') return 'halfClosed'
  if (current === 'synSent' && direction === 'reverse' && flags.includes('syn') && flags.includes('ack')) return 'established'
  return current
}

export class ConnectionTable {
  /** Entries still alive at `now` (strictly before `expiresAt`). */
  static alive(connections: readonly FirewallConnection[], now: number): FirewallConnection[] {
    return connections.filter((connection) => connection.expiresAt > now)
  }

  /**
   * The live entry `flow` belongs to. An ICMP echo matches only request → initiator side and reply → back;
   * with ICMP inspection off (D2) echoes are never looked up.
   */
  static find(connections: readonly FirewallConnection[], flow: FirewallFlow, inspectIcmp: boolean): ConnectionMatch | undefined {
    if (flow.protocol === 'icmp' && !inspectIcmp) return undefined
    for (const connection of connections) {
      const direction = directionOf(connection, flow)
      if (direction === null) continue
      if (flow.protocol === 'icmp' && flow.echo !== (direction === 'forward' ? 'request' : 'reply')) continue
      return { connection, direction }
    }
    return undefined
  }

  /** The entry an ICMP error is about: its quoted packet belongs to the entry in either direction. */
  static findQuoted(connections: readonly FirewallConnection[], quoted: FirewallFlow): ConnectionMatch | undefined {
    for (const connection of connections) {
      const direction = directionOf(connection, quoted)
      if (direction !== null) return { connection, direction }
    }
    return undefined
  }

  /** A new entry for the first packet of `flow` (TCP: synSent; UDP / ICMP: open). */
  static create(flow: FirewallFlow, origin: ConnectionOrigin, timeouts: FirewallTimeoutsMs): FirewallConnection {
    const state: FirewallConnectionState = flow.protocol === 'tcp' ? 'synSent' : 'open'
    return {
      id: origin.id,
      protocol: flow.protocol,
      initiator: flow.src,
      responder: flow.dst,
      inInterface: origin.inInterface,
      outInterface: origin.outInterface,
      state,
      createdAt: origin.now,
      lastUsedAt: origin.now,
      expiresAt: expiry(origin.now, idleTimeout(flow.protocol, state, timeouts)),
      bytes: origin.bytes,
    }
  }

  /** The entry after one more packet of its flow: state, idle refresh and bytes; null when RST closes it. */
  static advance(match: ConnectionMatch, flow: FirewallFlow, now: number, bytes: number, timeouts: FirewallTimeoutsMs): FirewallConnection | null {
    const { connection, direction } = match
    const state = connection.protocol === 'tcp' ? nextTcpState(connection.state, flow, direction) : connection.state
    if (state === null) return null
    return {
      ...connection,
      state,
      lastUsedAt: now,
      expiresAt: expiry(now, idleTimeout(connection.protocol, state, timeouts)),
      bytes: connection.bytes + bytes,
    }
  }

  /** The list with entry `id` replaced by `next`, or removed when `next` is null. */
  static replace(connections: readonly FirewallConnection[], id: number, next: FirewallConnection | null): FirewallConnection[] {
    if (next === null) return connections.filter((connection) => connection.id !== id)
    return connections.map((connection) => (connection.id === id ? next : connection))
  }
}
