// Read-only view of the firewall's connection table (runtime.extensions.firewallConnections,
// docs/FIREWALL_PACK.md §5.2): live rows only, oldest first, with idle time like `show conn`.
import type { FirewallConnection, FirewallConnectionState } from '../../../../sim/contract/FirewallRuntime'

export interface ConnectionRow {
  id: number
  protocol: FirewallConnection['protocol']
  /** 'inside 192.168.1.10:51000'. */
  from: string
  to: string
  state: FirewallConnectionState
  /** Whole seconds since the last packet. */
  idleSeconds: number
  bytes: number
}

const MS_PER_SECOND = 1000

export class FirewallConnectionsModel {
  /** The entries that have not expired at `now` (expiry is lazy, so the slot may still hold old ones). */
  static rows(connections: readonly FirewallConnection[], now: number): ConnectionRow[] {
    return connections
      .filter((connection) => connection.expiresAt > now)
      .sort((left, right) => left.id - right.id)
      .map((connection) => ({
        id: connection.id,
        protocol: connection.protocol,
        from: `${connection.inInterface} ${connection.initiator.ip}:${connection.initiator.port}`,
        to: `${connection.outInterface} ${connection.responder.ip}:${connection.responder.port}`,
        state: connection.state,
        idleSeconds: Math.max(0, Math.floor((now - connection.lastUsedAt) / MS_PER_SECOND)),
        bytes: connection.bytes,
      }))
  }
}
