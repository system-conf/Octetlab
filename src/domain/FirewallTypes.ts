// Firewall appliance (firewall pack, docs/FIREWALL_PACK.md §3). Stateful inspection by interface
// security levels; exceptions are ordinary access lists (AccessListTypes) bound with `access-group`,
// translation is the pack 5.2 NAT data (NatTypes). All keys are optional: absent = documented default.

/** Lowest and highest `security-level`. */
export const SECURITY_LEVEL_MIN = 0
export const SECURITY_LEVEL_MAX = 100

/**
 * Per-interface firewall settings (`L3Features.firewall`): `nameif <name>` and `security-level <n>`.
 * An interface without a nameif carries no transit traffic on a firewall (lab rule, §2).
 */
export interface FirewallInterfaceSettings {
  /** `nameif`, e.g. 'inside', 'outside', 'dmz'; unique per device. */
  nameif: string
  /** 0..100; absent = 0, except nameif 'inside' which defaults to 100 (appliance behaviour). */
  securityLevel?: number
}

/** Idle timeouts in seconds (`timeout conn|half-closed|udp|icmp`); absent = the defaults of §2. */
export interface FirewallTimeouts {
  /** TCP established, default 3600. */
  tcp?: number
  /** TCP after FIN, default 600. */
  halfClosed?: number
  /** UDP, default 120. */
  udp?: number
  /** ICMP, default 2. */
  icmp?: number
}

/** `host <ip>` or `subnet <ip> <mask>` of a network object. */
export type FirewallObjectAddress = { kind: 'host'; address: string } | { kind: 'subnet'; address: string; mask: string }

/**
 * The object's `nat (<real>,<mapped>) static|dynamic …` line. The firewall CLI maps it onto the pack 5.2
 * NAT data (`DeviceFeatures.nat`, `natRole`); this declaration is what running-config prints.
 */
export interface FirewallObjectNat {
  /** nameif of the real (untranslated) side, e.g. 'inside'. */
  realInterface: string
  /** nameif of the mapped side, e.g. 'outside'. */
  mappedInterface: string
  type: 'static' | 'dynamic'
  /** `interface` (the mapped interface's address) or an inline IPv4 address. */
  mapped: { kind: 'interface' } | { kind: 'address'; address: string }
}

/** `object network <name>` (FirewallSettings.objects); `address` absent until `host` / `subnet` is typed. */
export interface FirewallNetworkObject {
  name: string
  address?: FirewallObjectAddress
  nat?: FirewallObjectNat
}

/** Device-wide firewall settings (`DeviceFeatures.firewall`). */
export interface FirewallSettings {
  /** `same-security-traffic permit inter-interface`; absent = false (equal levels are blocked). */
  sameSecurityInterInterface?: boolean
  /** `same-security-traffic permit intra-interface` (hairpin); absent = false. */
  sameSecurityIntraInterface?: boolean
  /** ICMP echo is tracked like UDP; absent = true (lab rule, §2: ping-based checks keep working). */
  inspectIcmp?: boolean
  timeouts?: FirewallTimeouts
  /** Network objects in definition order; absent = none. */
  objects?: FirewallNetworkObject[]
}
