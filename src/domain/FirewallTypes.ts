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

/** Device-wide firewall settings (`DeviceFeatures.firewall`). */
export interface FirewallSettings {
  /** `same-security-traffic permit inter-interface`; absent = false (equal levels are blocked). */
  sameSecurityInterInterface?: boolean
  /** `same-security-traffic permit intra-interface` (hairpin); absent = false. */
  sameSecurityIntraInterface?: boolean
  /** ICMP echo is tracked like UDP; absent = true (lab rule, §2: ping-based checks keep working). */
  inspectIcmp?: boolean
  timeouts?: FirewallTimeouts
}
