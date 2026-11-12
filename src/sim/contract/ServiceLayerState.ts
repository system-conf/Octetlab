// Runtime state and timers of the services layer (S3, docs/SIMULATION.md §4).
// Owner-extensible: S3 may ADD optional fields, session members and timer members here during wave 3.1.
// DhcpBinding, DhcpClientLease and DnsCacheEntry are read by Phase 4 (`show ip dhcp binding`,
// `ipconfig /all`, `ipconfig /displaydns`): frozen.
import type { DhcpAdapterResult, RemoteConnectOutcome, StateEffect } from './Requests'

/** A DHCP server's view of one client (`show ip dhcp binding`). CLI. */
export interface DhcpBinding {
  readonly poolId: string
  readonly ip: string
  readonly mac: string
  /** `offered`: OFFER sent, waiting for REQUEST; `bound`: ACK sent. */
  readonly state: 'offered' | 'bound'
  readonly transactionId: number
  readonly leaseStart: number
  /** Virtual ms; null = infinite. */
  readonly leaseExpires: number | null
}

/** DHCP client state of one NIC (RFC 2131 state machine, reduced). CLI (`ipconfig /all`). */
export interface DhcpClientLease {
  readonly portId: string
  readonly phase: 'selecting' | 'requesting' | 'bound' | 'released' | 'failed'
  readonly transactionId: number
  /** Request that started the exchange; null for an automatic one. */
  readonly requestId: string | null
  /** DISCOVERs / REQUESTs sent in the current phase. */
  readonly attempts: number
  readonly offeredIp?: string
  readonly serverIp?: string
  readonly leaseObtainedAt?: number
  readonly leaseExpiresAt?: number
}

/** Resolver cache entry; `address` null = negative answer (NXDOMAIN). CLI. */
export interface DnsCacheEntry {
  readonly name: string
  readonly address: string | null
  readonly expiresAt: number
}

/** A client query (`nslookup`, name lookup before ping): servers in order, like DnsQuery.run. */
export interface DnsClientSession {
  readonly kind: 'dnsClient'
  readonly requestId: string
  readonly name: string
  readonly servers: readonly string[]
  readonly serverIndex: number
  readonly queryId: number
  readonly srcPort: number
  /** A server answered with ICMP port unreachable (no DNS there): the result becomes dnsNoAnswer. */
  readonly sawNoDns: boolean
  /** Read and write the resolver cache (name lookup before ping); absent = false (nslookup). S3 addition. */
  readonly useCache?: boolean
}

/** A DNS server forwarding a query it cannot answer from its records. */
export interface DnsForwardSession {
  readonly kind: 'dnsForward'
  readonly name: string
  readonly forwarderIndex: number
  readonly upstreamQueryId: number
  readonly srcPort: number
  /** Who asked: answered when the forwarders answer, silently dropped when they all fail. */
  readonly client: { readonly ip: string; readonly port: number; readonly queryId: number }
  /** S3 additions: the address the client asked (source of the answer) and the flow of its query. */
  readonly serverIp?: string
  readonly flowId?: string
}

/** Minimal HTTP/1.0 client: handshake, GET, response, close. */
export interface HttpClientSession {
  readonly kind: 'httpClient'
  readonly requestId: string
  readonly serverIp: string
  readonly host: string
  readonly path: string
  readonly srcPort: number
  readonly state: 'synSent' | 'requestSent' | 'closing' | 'done'
  readonly seq: number
  /** S3 addition: next byte expected from the server (acknowledgment number); absent before SYN-ACK. */
  readonly ack?: number
}

/**
 * S3 addition: progress of one `ipconfig /renew` over its NICs. Windows renews the adapters one after
 * the other, so the most recent lease decides the host gateway (DhcpService rule) in NIC order.
 */
export interface DhcpRenewSession {
  readonly kind: 'dhcpRenew'
  readonly requestId: string
  /** NICs still to renew; the first one is running. */
  readonly queue: readonly string[]
  readonly adapters: readonly DhcpAdapterResult[]
  readonly effects: readonly StateEffect[]
}

/**
 * Pack 5.2 addition (agent C, docs/SECURITY_PACK.md §9): an `ssh` / `telnet` client connection, scope A
 * (handshake, login data, the server's greeting, close). `verdict` is the login outcome the client
 * reports once the server greets it; it is worked out when the request starts, so no password is kept.
 */
export interface RemoteClientSession {
  readonly kind: 'remoteClient'
  readonly requestId: string
  readonly protocol: 'ssh' | 'telnet'
  readonly targetIp: string
  readonly srcPort: number
  readonly state: 'synSent' | 'loginSent'
  readonly seq: number
  readonly ack?: number
  readonly verdict: RemoteConnectOutcome
}

export type ServiceSession = DnsClientSession | DnsForwardSession | HttpClientSession | DhcpRenewSession | RemoteClientSession

export interface ServiceRuntime {
  /** CLI */
  readonly dhcpBindings: readonly DhcpBinding[]
  /** CLI */
  readonly dhcpClients: readonly DhcpClientLease[]
  /** CLI */
  readonly dnsCache: readonly DnsCacheEntry[]
  readonly sessions: readonly ServiceSession[]
  /** Next ephemeral port (Windows: 49152 and up, sequential). */
  readonly nextEphemeralPort: number
}

/** Timers of the services layer. */
export type ServiceTimer =
  | {
      readonly layer: 'services'
      readonly kind: 'dhcpRetransmit'
      readonly portId: string
      readonly transactionId: number
      /** S3 additions: the phase and attempt the timer belongs to (a later phase / attempt makes it stale). */
      readonly phase?: 'selecting' | 'requesting'
      readonly attempt?: number
    }
  | { readonly layer: 'services'; readonly kind: 'dnsTimeout'; readonly queryId: number }
  | { readonly layer: 'services'; readonly kind: 'dnsForwardTimeout'; readonly upstreamQueryId: number }
  | { readonly layer: 'services'; readonly kind: 'httpTimeout'; readonly requestId: string }
  /** Pack 5.2 addition (agent C): an `ssh` / `telnet` connection attempt gives up. */
  | { readonly layer: 'services'; readonly kind: 'remoteTimeout'; readonly requestId: string }
