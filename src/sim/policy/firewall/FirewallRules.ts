// The configuration rules of the stateful firewall (docs/FIREWALL_PACK.md §5.1 steps 1, 3–6), pure over
// the Device. FirewallPolicy uses `verdict` for a forwarded packet that matched no connection; agent B's
// `packet-tracer` uses `decide` (D5). Both evaluate the bound access lists with AclMatcher: on a firewall
// AclPolicy steps aside, so these are the only ACL checks (and they never see tracked replies).
import type { AccessList, Device, FirewallSettings } from '../../../domain'
import { type AclDecision, AclMatcher, type AclPacketView } from '../../../net/AclMatcher'
import type { SimReason } from '../../contract'
import { AclBindings } from '../acl/AclBindings'
import { FirewallConfig, type FirewallInterface } from './FirewallConfig'
import { FirewallFlows } from './FirewallFlows'

/** The drop reasons the firewall gives (silent drops, §5.1). */
export type FirewallDropReason = Extract<SimReason, 'firewallNoNameif' | 'firewallSameLevel' | 'firewallDenied' | 'firewallNoConnection' | 'aclDenied'>

/**
 * Why a packet was allowed:
 * - `toDevice`: addressed to the firewall itself (steps 1 and 2 only);
 * - `higherToLower`: from a higher to a lower security level (step 4);
 * - `sameLevelPermitted`: equal levels with the matching same-security-traffic switch (step 3);
 * - `aclException`: lower → higher with an inbound ACL bound on the ingress interface (step 5).
 */
export type FirewallAllowRule = 'toDevice' | 'higherToLower' | 'sameLevelPermitted' | 'aclException'

/** How a TCP segment relates to step 6: `opener` = SYN without ACK, `midStream` = anything else. */
export type FirewallTcpKind = 'opener' | 'midStream' | 'notTcp'

export type FirewallVerdict =
  | { readonly kind: 'allow'; readonly rule: Exclude<FirewallAllowRule, 'toDevice'> }
  | { readonly kind: 'drop'; readonly reason: Exclude<FirewallDropReason, 'firewallNoNameif'> }

/** One bound access list evaluated by `decide`. */
export interface FirewallAclCheck {
  readonly acl: string
  readonly direction: 'in' | 'out'
  readonly interfaceId: string
  readonly decision: AclDecision
  readonly permitted: boolean
}

/** `verdict` and the access lists it evaluated on the way. */
export interface FirewallEvaluation {
  readonly verdict: FirewallVerdict
  readonly acls: readonly FirewallAclCheck[]
}

export type FirewallDecision =
  | {
      readonly kind: 'allow'
      readonly rule: FirewallAllowRule
      readonly ingress: FirewallInterface
      readonly exit: FirewallInterface | null
      readonly acls: readonly FirewallAclCheck[]
    }
  | {
      readonly kind: 'drop'
      readonly reason: FirewallDropReason
      readonly ingress: FirewallInterface | null
      readonly exit: FirewallInterface | null
      readonly acls: readonly FirewallAclCheck[]
    }

function aclCheck(device: Device, iface: FirewallInterface, direction: 'in' | 'out', packet: AclPacketView): FirewallAclCheck | null {
  const acl = iface.accessGroups?.[direction]
  if (acl === undefined) return null
  const list: AccessList | undefined = AclBindings.list(device, acl)
  const decision = AclMatcher.decide(list, packet)
  return { acl, direction, interfaceId: iface.id, decision, permitted: AclMatcher.permits(decision) }
}

function tcpKindOf(packet: AclPacketView): FirewallTcpKind {
  if (packet.protocol !== 'tcp') return 'notTcp'
  // packet-tracer imagines the first packet of a connection when it gives no flags.
  if (packet.tcpFlags === undefined) return 'opener'
  return FirewallFlows.isTcpOpener(packet.tcpFlags) ? 'opener' : 'midStream'
}

export class FirewallRules {
  /**
   * Steps 3–6 for a packet that belongs to no connection, between two interfaces that both have a nameif.
   * `packet` carries the real (untranslated) addresses. Order: inbound ACL of the ingress interface, level
   * rule (lower → higher needs that inbound ACL bound and permitting), outbound ACL of the exit interface,
   * TCP without SYN. `acls` lists the lists evaluated, in order (a drop stops the walk).
   */
  static verdict(device: Device, ingress: FirewallInterface, exit: FirewallInterface, packet: AclPacketView, tcp: FirewallTcpKind): FirewallEvaluation {
    const acls: FirewallAclCheck[] = []
    const inbound = aclCheck(device, ingress, 'in', packet)
    if (inbound !== null) acls.push(inbound)
    if (inbound !== null && !inbound.permitted) return { verdict: { kind: 'drop', reason: 'aclDenied' }, acls }
    const level = FirewallRules.levelVerdict(FirewallConfig.settingsOf(device), ingress, exit)
    if (level.kind === 'drop') return { verdict: level, acls }
    const outbound = aclCheck(device, exit, 'out', packet)
    if (outbound !== null) acls.push(outbound)
    if (outbound !== null && !outbound.permitted) return { verdict: { kind: 'drop', reason: 'aclDenied' }, acls }
    if (tcp === 'midStream') return { verdict: { kind: 'drop', reason: 'firewallNoConnection' }, acls }
    return { verdict: level, acls }
  }

  /**
   * packet-tracer (D5): the configured rules for one imagined packet entering `ingressInterfaceId`. The
   * exit interface comes from the caller's route lookup; null = the packet is addressed to the firewall.
   * Order: nameif (ingress, exit), then `verdict`. A view without `tcpFlags` is a SYN.
   */
  static decide(device: Device, ingressInterfaceId: string, packet: AclPacketView, exitInterfaceId: string | null): FirewallDecision {
    const ingress = FirewallConfig.interfaceOf(device, ingressInterfaceId)
    const exit = exitInterfaceId === null ? null : FirewallConfig.interfaceOf(device, exitInterfaceId)
    if (ingress === null) return { kind: 'drop', reason: 'firewallNoNameif', ingress, exit, acls: [] }
    if (exitInterfaceId === null) return { kind: 'allow', rule: 'toDevice', ingress, exit, acls: [] }
    if (exit === null) return { kind: 'drop', reason: 'firewallNoNameif', ingress, exit, acls: [] }
    const { verdict, acls } = FirewallRules.verdict(device, ingress, exit, packet, tcpKindOf(packet))
    if (verdict.kind === 'drop') return { kind: 'drop', reason: verdict.reason, ingress, exit, acls }
    return { kind: 'allow', rule: verdict.rule, ingress, exit, acls }
  }

  /** Steps 3–5: same level, higher → lower, lower → higher with an inbound ACL bound. */
  private static levelVerdict(settings: FirewallSettings, ingress: FirewallInterface, exit: FirewallInterface): FirewallVerdict {
    if (ingress.level === exit.level) {
      const permitted = ingress.id === exit.id ? settings.sameSecurityIntraInterface === true : settings.sameSecurityInterInterface === true
      return permitted ? { kind: 'allow', rule: 'sameLevelPermitted' } : { kind: 'drop', reason: 'firewallSameLevel' }
    }
    if (ingress.level > exit.level) return { kind: 'allow', rule: 'higherToLower' }
    return ingress.accessGroups?.in !== undefined ? { kind: 'allow', rule: 'aclException' } : { kind: 'drop', reason: 'firewallDenied' }
  }
}
