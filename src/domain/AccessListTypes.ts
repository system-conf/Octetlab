// Access control lists (pack 5.2, docs/SECURITY_PACK.md §3). IOS semantics: entries are checked in
// sequence order, the first match decides, and an implicit `deny any` ends every list. A binding that
// names a list which does not exist permits everything (lab rule, SECURITY_PACK.md §2).

export type AclAction = 'permit' | 'deny'
export type AclProtocol = 'ip' | 'icmp' | 'tcp' | 'udp'

/** Dotted address + wildcard; `any` = 0.0.0.0 / 255.255.255.255, `host x` = x / 0.0.0.0. */
export interface AclAddressMatch {
  address: string
  wildcard: string
}

export type AclPortMatch = { op: 'eq' | 'neq' | 'gt' | 'lt'; port: number } | { op: 'range'; from: number; to: number }

interface AclEntryBase {
  /** 1..2147483647, unique in the list. Shown by `show access-lists`, never written to running-config. */
  seq: number
}

export interface AclRemark extends AclEntryBase {
  kind: 'remark'
  text: string
}

export interface StandardAclRule extends AclEntryBase {
  kind: 'standard'
  action: AclAction
  source: AclAddressMatch
  log?: boolean
}

export interface ExtendedAclRule extends AclEntryBase {
  kind: 'extended'
  action: AclAction
  protocol: AclProtocol
  source: AclAddressMatch
  sourcePort?: AclPortMatch
  destination: AclAddressMatch
  destinationPort?: AclPortMatch
  /** `established` (tcp only): matches segments with ACK or RST set. */
  established?: boolean
  /** icmp only; names (echo, echo-reply…) are mapped to numbers by the CLI. */
  icmpType?: number
  icmpCode?: number
  log?: boolean
}

export type AclEntry = AclRemark | StandardAclRule | ExtendedAclRule

export type AccessListType = 'standard' | 'extended'

export interface AccessList {
  /** '10', '101' (numbered) or 'BLOCK_WEB' (named). Numbered: 1-99 / 1300-1999 standard, 100-199 / 2000-2699 extended. */
  name: string
  type: AccessListType
  /** Sorted by `seq`; standard lists hold only standard rules and remarks, extended lists extended rules and remarks. */
  entries: AclEntry[]
}

/** `DeviceFeatures.accessLists`. */
export interface AccessListSettings {
  lists: AccessList[]
}

/** `ip access-group <acl> in|out` (L3Features.accessGroups) or `access-class <acl> in|out` (LineSettings.accessClass). */
export interface AclBinding {
  in?: string
  out?: string
}
