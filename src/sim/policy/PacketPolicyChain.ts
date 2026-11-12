// Composes the pack 5.2 policies in IOS order (docs/SECURITY_PACK.md §5): ingress runs the chain
// front to back (ACL in, then NAT outside→inside), egress back to front (NAT inside→outside, then
// ACL out). The first drop ends the walk; a pass hands its (possibly rewritten) packet on.
import type { DeviceContext, Ipv4Packet } from '../contract'
import type { EgressPacket, IngressPacket, PacketPolicy, PolicyVerdict } from './PacketPolicy'

export class PacketPolicyChain implements PacketPolicy {
  private readonly policies: readonly PacketPolicy[]

  /** `policies` in ingress order: [acl, nat]. */
  constructor(policies: readonly PacketPolicy[]) {
    this.policies = policies
  }

  ingress(ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    return PacketPolicyChain.walk(this.policies, arrival.packet, (policy, packet) => policy.ingress(ctx, { ...arrival, packet }))
  }

  egress(ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    return PacketPolicyChain.walk([...this.policies].reverse(), departure.packet, (policy, packet) => policy.egress(ctx, { ...departure, packet }))
  }

  private static walk(
    policies: readonly PacketPolicy[],
    start: Ipv4Packet,
    step: (policy: PacketPolicy, packet: Ipv4Packet) => PolicyVerdict,
  ): PolicyVerdict {
    let packet = start
    for (const policy of policies) {
      const verdict = step(policy, packet)
      if (verdict.kind === 'drop') return verdict
      packet = verdict.packet
    }
    return { kind: 'pass', packet }
  }
}
