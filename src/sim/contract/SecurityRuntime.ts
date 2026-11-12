// Runtime slots of pack 5.2 (docs/SECURITY_PACK.md §5): ACL hit counters (agent A) and the NAT
// translation table (agent B). Immutable and JSON-serializable like the rest of DeviceRuntime.

/** ACL name → sequence number → matches since the last `clear access-list counters`. */
export type AclCounters = Readonly<Record<string, Readonly<Record<number, number>>>>

/** One address (and port / ICMP identifier for PAT) of a translation. */
export interface NatEndpoint {
  readonly ip: string
  readonly port?: number
}

/** One row of `show ip nat translations`. Expiry is lazy on the virtual clock, like ARP entries. */
export interface NatTranslation {
  /** 'any' = a simple (address-only) static or dynamic entry ("---" in the Pro column). */
  readonly protocol: 'icmp' | 'tcp' | 'udp' | 'any'
  readonly insideLocal: NatEndpoint
  readonly insideGlobal: NatEndpoint
  readonly outsideLocal?: NatEndpoint
  readonly outsideGlobal?: NatEndpoint
  readonly origin: 'static' | 'dynamic'
  /** Virtual time (ms). */
  readonly createdAt: number
  readonly lastUsedAt: number
  /** Static entries never expire. */
  readonly expiresAt: number | null
}

export interface NatStatistics {
  readonly hits: number
  readonly misses: number
  readonly expired: number
}
