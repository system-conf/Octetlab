// The packet-policy hook of pack 5.2 (docs/SECURITY_PACK.md §5): ACLs and NAT see every IPv4 packet a
// router or L3 switch receives (ingress) or forwards (egress) without editing the forwarding code.
// IOS order (Cisco NAT order of operations, doc 6209): ingress = input ACL, then NAT outside→inside,
// then "for me?" / routing; egress (after routing) = NAT inside→outside, then output ACL.
// Packets the router originates itself do not pass egress (no outbound ACL / NAT on them).
import type { DeviceContext, EventBuilder, IcmpUnreachableCode, Ipv4Packet, SimReason } from '../contract'

/** What a policy decided. `pass` may carry a rewritten packet (NAT); `drop` may ask for an ICMP error. */
export type PolicyVerdict =
  | { readonly kind: 'pass'; readonly packet: Ipv4Packet }
  | { readonly kind: 'drop'; readonly reason: SimReason; readonly icmp?: IcmpUnreachableCode }

/** A packet arriving on a layer-3 interface of a router / L3 switch, before the own-address check. */
export interface IngressPacket {
  readonly interfaceId: string
  readonly packet: Ipv4Packet
  readonly linkBroadcast: boolean
  /** The arrival's event: policies add inspector notes here (they never conclude it). */
  readonly event: EventBuilder
}

/** A forwarded packet after routing (TTL already decremented), before it is handed to the link layer. */
export interface EgressPacket {
  readonly ingressInterfaceId: string
  readonly exitInterfaceId: string
  readonly packet: Ipv4Packet
  readonly event: EventBuilder
}

/**
 * One feature in the chain (agent A: AclPolicy, agent B: NatPolicy). Implementations must be pure with
 * respect to their configuration (`ctx.device.features`, the port's `l3.features`) and keep runtime state
 * only in `ctx.runtime.extensions` (SecurityRuntime). A device without the feature's configuration must
 * get `pass` with the same packet object.
 */
export interface PacketPolicy {
  ingress(ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict
  egress(ctx: DeviceContext, departure: EgressPacket): PolicyVerdict
}

export const PASS = (packet: Ipv4Packet): PolicyVerdict => ({ kind: 'pass', packet })
