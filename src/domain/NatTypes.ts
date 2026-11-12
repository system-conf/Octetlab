// Network address translation (pack 5.2, docs/SECURITY_PACK.md §3). Inside source translation only
// (`ip nat inside source …`), like the IOS address-conservation guide.

/** `ip nat pool <name> <start> <end> netmask <mask>` (`prefix-length n` is stored as a mask). */
export interface NatPool {
  name: string
  start: string
  end: string
  netmask: string
}

/** `ip nat inside source static [tcp|udp] <local> [port] <global> [port]`. */
export interface NatStaticRule {
  kind: 'static'
  insideLocal: string
  insideGlobal: string
  /** Port forwarding: protocol and both ports are set together. */
  protocol?: 'tcp' | 'udp'
  insideLocalPort?: number
  insideGlobalPort?: number
}

export type NatDynamicTarget = { kind: 'pool'; poolName: string } | { kind: 'interface'; interfaceId: string }

/** `ip nat inside source list <acl> pool <pool> [overload]` / `… interface <if> overload`. */
export interface NatDynamicRule {
  kind: 'dynamic'
  aclName: string
  target: NatDynamicTarget
  overload: boolean
}

/** `DeviceFeatures.nat`. */
export interface NatSettings {
  pools: NatPool[]
  statics: NatStaticRule[]
  dynamics: NatDynamicRule[]
}

/** `ip nat inside` / `ip nat outside` (L3Features.natRole). */
export type NatRole = 'inside' | 'outside'
