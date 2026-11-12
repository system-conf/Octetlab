// The pure ACL decision (pack 5.2, owner: agent A; docs/SECURITY_PACK.md §7). Shared by the
// simulator's AclPolicy (ip access-group), the vty `access-class` check (agent C) and any GUI preview.
// PRELUDE STUB: the signature is the contract; agent A replaces the body (sequence order, first match,
// wildcard masks, ports, `established`, icmp type / code, implicit deny).
import type { AccessList, AclAction } from '../domain'

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

export class AclMatcher {
  /** `list` = the ACL the binding names, undefined when it does not exist. */
  static decide(list: AccessList | undefined, packet: AclPacketView): AclDecision {
    // Stub until agent A: a binding never filters (nothing calls this yet).
    void packet
    if (list === undefined) return { kind: 'noList' }
    return { kind: 'noList' }
  }

  static permits(decision: AclDecision): boolean {
    return decision.kind === 'noList' || (decision.kind === 'match' && decision.action === 'permit')
  }
}
