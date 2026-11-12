// The pure ACL decision (pack 5.2, owner: agent A; docs/SECURITY_PACK.md §7). Shared by the
// simulator's AclPolicy (ip access-group), the vty `access-class` check (agent C) and any GUI preview.
// IOS semantics:
// - entries are checked in sequence order and the first match decides; an implicit `deny any` ends
//   every list, but an empty list permits everything
//   (https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-16/sec-data-acl-xe-16-book/sec-create-ip-apply.html);
// - wildcard bits: 0 = must match, 1 = ignored
//   (https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html);
// - `established` matches TCP segments with ACK or RST set; remarks never match.
import type { AccessList, AclAction, AclAddressMatch, AclEntry, AclPortMatch, ExtendedAclRule } from '../domain'
import { Ipv4 } from './Ipv4'

/** The packet fields an ACL looks at (no simulator types, so CLI / GUI code can call it too). */
export interface AclPacketView {
  readonly protocol: 'icmp' | 'tcp' | 'udp' | 'other'
  readonly src: string
  readonly dst: string
  readonly srcPort?: number
  readonly dstPort?: number
  /** TCP flags present on the segment ('ack', 'rst' make `established` match). */
  readonly tcpFlags?: readonly ('syn' | 'ack' | 'fin' | 'rst' | 'psh')[]
  readonly icmpType?: number
  readonly icmpCode?: number
}

/**
 * - `match`: an entry matched; `seq` is the entry's sequence number (for the hit counters).
 * - `implicitDeny`: the list exists and nothing matched.
 * - `noList`: the binding names a list that does not exist → permit (lab rule, SECURITY_PACK.md §2).
 */
export type AclDecision = { readonly kind: 'match'; readonly action: AclAction; readonly seq: number } | { readonly kind: 'implicitDeny' } | { readonly kind: 'noList' }

type AclRule = Exclude<AclEntry, { kind: 'remark' }>

const EMPTY_LIST_PERMITS: AclDecision = { kind: 'noList' }

export class AclMatcher {
  /** `list` = the ACL the binding names, undefined when it does not exist. */
  static decide(list: AccessList | undefined, packet: AclPacketView): AclDecision {
    if (list === undefined) return { kind: 'noList' }
    const rules = list.entries.filter((entry): entry is AclRule => entry.kind !== 'remark').sort((first, second) => first.seq - second.seq)
    // An empty list (or one with remarks only) permits all, like a missing one (IOS, see the header).
    if (rules.length === 0) return EMPTY_LIST_PERMITS
    for (const entry of rules) {
      if (AclMatcher.matches(entry, packet)) return { kind: 'match', action: entry.action, seq: entry.seq }
    }
    return { kind: 'implicitDeny' }
  }

  static permits(decision: AclDecision): boolean {
    return decision.kind === 'noList' || (decision.kind === 'match' && decision.action === 'permit')
  }

  /** True when `entry` matches the packet; remarks never match. */
  static matches(entry: AclEntry, packet: AclPacketView): boolean {
    switch (entry.kind) {
      case 'remark':
        return false
      case 'standard':
        return AclMatcher.addressMatches(entry.source, packet.src)
      case 'extended':
        return AclMatcher.extendedMatches(entry, packet)
    }
  }

  /** Wildcard compare: every bit that is 0 in the wildcard must be equal in both addresses. */
  static addressMatches(match: AclAddressMatch, address: string): boolean {
    const value = Ipv4.parse(address)
    const base = Ipv4.parse(match.address)
    const wildcard = Ipv4.parse(match.wildcard)
    if (value === null || base === null || wildcard === null) return false
    const care = ~wildcard >>> 0
    return ((value & care) >>> 0) === ((base & care) >>> 0)
  }

  static portMatches(match: AclPortMatch | undefined, port: number | undefined): boolean {
    if (match === undefined) return true
    if (port === undefined) return false
    switch (match.op) {
      case 'eq':
        return port === match.port
      case 'neq':
        return port !== match.port
      case 'gt':
        return port > match.port
      case 'lt':
        return port < match.port
      case 'range':
        return port >= match.from && port <= match.to
    }
  }

  private static extendedMatches(rule: ExtendedAclRule, packet: AclPacketView): boolean {
    if (rule.protocol !== 'ip' && rule.protocol !== packet.protocol) return false
    if (!AclMatcher.addressMatches(rule.source, packet.src) || !AclMatcher.addressMatches(rule.destination, packet.dst)) return false
    if (rule.protocol === 'tcp' || rule.protocol === 'udp') {
      if (!AclMatcher.portMatches(rule.sourcePort, packet.srcPort) || !AclMatcher.portMatches(rule.destinationPort, packet.dstPort)) return false
    }
    if (rule.protocol === 'tcp' && rule.established === true) {
      const flags = packet.tcpFlags ?? []
      if (!flags.includes('ack') && !flags.includes('rst')) return false
    }
    if (rule.protocol === 'icmp') {
      if (rule.icmpType !== undefined && rule.icmpType !== packet.icmpType) return false
      if (rule.icmpCode !== undefined && rule.icmpCode !== packet.icmpCode) return false
    }
    return true
  }
}
