// Runtime slots of the firewall pack (docs/FIREWALL_PACK.md §5): the connection table and its
// counters (agent A). Immutable and JSON-serializable like the rest of DeviceRuntime; expiry is lazy on
// the virtual clock (`expiresAt` compared with `ctx.now`), like ARP and NAT entries.

/** One end of a tracked connection; `port` is the TCP/UDP port or the ICMP echo identifier. */
export interface FirewallEndpoint {
  readonly ip: string
  readonly port: number
}

/**
 * TCP: 'synSent' after the first SYN, 'established' after the reply, 'halfClosed' after a FIN.
 * UDP and ICMP echo use 'open'. RST removes the entry.
 */
export type FirewallConnectionState = 'synSent' | 'established' | 'halfClosed' | 'open'

/** One row of `show conn`. Addresses are the real (untranslated) ones; NAT keeps its own table. */
export interface FirewallConnection {
  /** Unique within the device's table (allocation order). */
  readonly id: number
  readonly protocol: 'tcp' | 'udp' | 'icmp'
  /** The side that opened the connection. */
  readonly initiator: FirewallEndpoint
  readonly responder: FirewallEndpoint
  /** nameif of the interface the first packet came in on / left by. */
  readonly inInterface: string
  readonly outInterface: string
  readonly state: FirewallConnectionState
  /** Virtual time (ms). */
  readonly createdAt: number
  readonly lastUsedAt: number
  readonly expiresAt: number
  /** IP bytes seen in both directions. */
  readonly bytes: number
}

export interface FirewallStatistics {
  /** Connections created since the last clear. */
  readonly created: number
  /** Packets dropped by the firewall (no connection, level rule, ACL exception missing). */
  readonly denied: number
  readonly expired: number
}
