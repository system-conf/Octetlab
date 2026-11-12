// High-level requests the UI / terminal inject, and the results their clients report
// (docs/SIMULATION.md §5, §7). Results are written by the client application on the source device when
// it consumes an answer or gives up, so every result has a matching event in the stream.
import type { ResolveResult } from '../../domain'
import type { IcmpUnreachableCode } from './Pdu'
import type { SimReason } from './SimReason'

/** ICMP echoes (ping; a PT "simple PDU" is `count: 1`). Owner: network layer (S2). */
export interface SimPingRequest {
  readonly kind: 'ping'
  readonly deviceId: string
  readonly targetIp: string
  readonly count: number
  /** Data bytes per echo (ping -l). */
  readonly size: number
  /** Initial TTL; default SIM_TTL.host / SIM_TTL.router. */
  readonly ttl?: number
}

/** Windows tracert. Owner: network layer (S2). */
export interface SimTracertRequest {
  readonly kind: 'tracert'
  readonly deviceId: string
  readonly targetIp: string
  /** Windows: 30. */
  readonly maxHops: number
  /** Windows: 3. */
  readonly probesPerHop: number
  /** Lab limit: stop after this many silent hops in a row (TracertFormatter prints at most 4). */
  readonly maxSilentHops: number
}

/** `ipconfig /renew`: DORA on one NIC, or on every active NIC in DHCP mode. Owner: services (S3). */
export interface SimDhcpRenewRequest {
  readonly kind: 'dhcpRenew'
  readonly deviceId: string
  readonly portId?: string
}

/** `ipconfig /release`: DHCPRELEASE, then the NIC has no address. Owner: services (S3). */
export interface SimDhcpReleaseRequest {
  readonly kind: 'dhcpRelease'
  readonly deviceId: string
  readonly portId?: string
}

/** `nslookup` / name lookup before ping. `servers` absent = the host's DNS servers. Owner: services (S3). */
export interface SimDnsQueryRequest {
  readonly kind: 'dnsQuery'
  readonly deviceId: string
  readonly name: string
  readonly servers?: readonly string[]
  /** Answer from the resolver cache when possible (ping by name); false = always ask (nslookup). Default false. */
  readonly useCache?: boolean
}

/** Web browser GET of `http://<host><path>` at an already resolved address. Owner: services (S3). */
export interface SimHttpGetRequest {
  readonly kind: 'httpGet'
  readonly deviceId: string
  readonly serverIp: string
  readonly host: string
  readonly path: string
}

/**
 * `arp -d`, `clear ip arp`, `clear mac address-table dynamic`, `ipconfig /flushdns`,
 * `clear ip nat translation *`, `clear access-list counters`. No packets.
 */
export interface SimClearTableRequest {
  readonly kind: 'clearTable'
  readonly deviceId: string
  /** arp, mac: link layer (S1); dnsCache: services (S3); natTranslations, aclCounters: network layer (pack 5.2). */
  readonly table: 'arp' | 'mac' | 'dnsCache' | 'natTranslations' | 'aclCounters'
}

/**
 * Pack 5.2 (docs/SECURITY_PACK.md §6): `ssh -l <user> <ip>` / `telnet <ip>` from a host or router.
 * Connect over TCP 22 / 23, then authenticate against the target's vty settings (scope A: no remote
 * prompt; the result says how far it got). Owner: services (agent C).
 */
export interface SimRemoteConnectRequest {
  readonly kind: 'remoteConnect'
  readonly deviceId: string
  readonly protocol: 'ssh' | 'telnet'
  readonly targetIp: string
  /** ssh `-l <user>`; telnet with `login local` asks for one (taken from here; absent = none given). */
  readonly username?: string
  readonly password?: string
}

export type SimRequest =
  | SimPingRequest
  | SimTracertRequest
  | SimDhcpRenewRequest
  | SimDhcpReleaseRequest
  | SimDnsQueryRequest
  | SimHttpGetRequest
  | SimClearTableRequest
  | SimRemoteConnectRequest

// ---------------------------------------------------------------- results

/** One echo of a ping. `requestPduId` links it to the events of its echo request. */
export type EchoResult =
  | { readonly kind: 'reply'; readonly sequence: number; readonly requestPduId: string; readonly fromIp: string; readonly ttl: number; readonly bytes: number; readonly rttMs: number }
  /** ICMP destination unreachable; `fromIp` = own address when the sender's own ARP failed (Windows). */
  | { readonly kind: 'unreachable'; readonly sequence: number; readonly requestPduId: string; readonly fromIp: string; readonly code: IcmpUnreachableCode }
  | { readonly kind: 'ttlExpired'; readonly sequence: number; readonly requestPduId: string; readonly fromIp: string }
  | { readonly kind: 'timeout'; readonly sequence: number; readonly requestPduId: string }
  /** Never sent: no link, no usable address, no gateway… (Windows "General failure"). */
  | { readonly kind: 'localFailure'; readonly sequence: number; readonly reason: SimReason }

export interface PingResult {
  readonly kind: 'ping'
  /**
   * In sequence order: every echo result so far, or the latest SIM_LIMITS.echoResultsKept of them once a
   * long ping (`count` 1e9) passed that many. `stats` always covers all of them.
   */
  readonly echoes: readonly EchoResult[]
  readonly stats: PingStats
}

/** Counters over every echo result of a ping, also those no longer kept in `echoes`. */
export interface PingStats {
  /** Echo results reported (= echoes that ended). */
  readonly results: number
  readonly replies: number
  /** ICMP errors about an echo (unreachable, TTL expired): Windows counts them as received. */
  readonly errors: number
  readonly timeouts: number
  readonly localFailures: number
  /** Round trip times of the replies; null before the first reply. */
  readonly minRttMs: number | null
  readonly maxRttMs: number | null
  readonly totalRttMs: number
}

export type TracertProbeResult =
  | { readonly kind: 'timeExceeded' | 'echoReply'; readonly fromIp: string; readonly rttMs: number }
  | { readonly kind: 'unreachable'; readonly fromIp: string; readonly rttMs: number; readonly code: IcmpUnreachableCode }
  | { readonly kind: 'timeout' }

export interface TracertHopResult {
  /** TTL of the probes (hop number). */
  readonly ttl: number
  readonly probes: readonly TracertProbeResult[]
}

export type TracertEndingResult =
  | { readonly kind: 'reached' }
  | { readonly kind: 'unreachable'; readonly reporterIp: string; readonly code: IcmpUnreachableCode }
  /** `maxSilentHops` hops in a row without an answer. */
  | { readonly kind: 'silent' }
  | { readonly kind: 'hopLimit' }
  | { readonly kind: 'localFailure'; readonly reason: SimReason }

export interface TracertResult {
  readonly kind: 'tracert'
  readonly hops: readonly TracertHopResult[]
  /** null while running. */
  readonly ending: TracertEndingResult | null
}

export type DhcpAdapterFailure = Extract<
  SimReason,
  'dhcpNak' | 'cableDisconnected' | 'portDisabled' | 'invalidConfig' | 'powerOff' | 'requestTimedOut'
>

/** Outcome on one NIC. `requestTimedOut` covers both "no server" and "pool exhausted" (the client cannot tell). */
export type DhcpAdapterResult =
  | { readonly portId: string; readonly ok: true; readonly ip: string; readonly mask: string; readonly gateway: string; readonly dnsServers: readonly string[]; readonly serverIp: string }
  | { readonly portId: string; readonly ok: true; readonly released: true }
  | { readonly portId: string; readonly ok: false; readonly reason: DhcpAdapterFailure }

export interface DhcpResult {
  readonly kind: 'dhcp'
  readonly operation: 'renew' | 'release'
  readonly adapters: readonly DhcpAdapterResult[]
  /** Configuration changes the exchange caused (already applied to the engine's network). */
  readonly effects: readonly StateEffect[]
}

/** Same shape as the rule engine's answer, so nslookup formatting and the oracle compare directly. */
export interface DnsResult {
  readonly kind: 'dns'
  readonly name: string
  readonly answer: ResolveResult
}

export interface HttpResult {
  readonly kind: 'http'
  readonly outcome:
    | { readonly ok: true; readonly status: number; readonly contentBytes: number }
    | { readonly ok: false; readonly reason: SimReason }
}

export interface ClearResult {
  readonly kind: 'cleared'
  readonly entries: number
}

/**
 * How a remote session attempt ended. `open` = connected and authenticated (scope A ends there);
 * the failures map to client messages ("% Connection refused by remote host", time-out, "Password
 * required, but none set", "% Authentication failed").
 */
export type RemoteConnectOutcome =
  | { readonly ok: true; readonly hostname: string; readonly bannerMotd?: string; readonly privilege: number }
  | {
      readonly ok: false
      readonly failure: 'refused' | 'timedOut' | 'unreachable' | 'adminProhibited' | 'passwordNotSet' | 'authFailed' | 'localFailure'
      readonly reason: SimReason
    }

export interface RemoteConnectResult {
  readonly kind: 'remoteConnect'
  readonly protocol: 'ssh' | 'telnet'
  readonly targetIp: string
  readonly outcome: RemoteConnectOutcome
}

export type RequestResult = PingResult | TracertResult | DhcpResult | DnsResult | HttpResult | ClearResult | RemoteConnectResult

export type RequestStatus = 'queued' | 'running' | 'done'

export interface RequestRecord {
  /** 'r<n>'; also the flowId of every PDU the request causes. */
  readonly id: string
  readonly request: SimRequest
  readonly status: RequestStatus
  readonly queuedAt: number
  readonly finishedAt: number | null
  /** null until the client reports; partial while running. */
  readonly result: RequestResult | null
  /** Set when the kernel ended the request: the device was powered off or removed. */
  readonly aborted?: 'deviceOff' | 'deviceRemoved'
}

// ---------------------------------------------------------------- configuration effects

/**
 * A change of the lab configuration caused by the simulation (today only DHCP). The engine applies it
 * to its own network (ServiceLayer.applyEffect) and lists it in the result; the session applies the same
 * effects to the lab document, so document and engine stay equal (docs/SIMULATION.md §5.4).
 */
export type StateEffect =
  | {
      readonly kind: 'dhcpLeaseBound'
      readonly clientId: string
      readonly portId: string
      readonly mac: string
      readonly ip: string
      readonly mask: string
      readonly gateway: string
      readonly dnsServers: readonly string[]
      readonly serverId: string
      readonly poolId: string
    }
  | { readonly kind: 'dhcpLeaseReleased'; readonly clientId: string; readonly portId: string }
