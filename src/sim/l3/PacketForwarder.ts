import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces } from '../../net/L3Interfaces'
import type { DeviceContext, Ipv4Delivery } from '../contract'
import type { PacketPolicy } from '../policy/PacketPolicy'
import type { ErrorCause, IcmpResponder } from './IcmpResponder'
import { InterfaceAddresses } from './InterfaceAddresses'
import { L3Notes } from './L3Notes'
import { RouteLookup } from './RouteLookup'

/**
 * A router forwarding a packet that is not for itself (docs/SIMULATION.md §7.2): TTL ≤ 1 → time
 * exceeded; longest prefix then AD; no route → silence for public destinations (the engine's
 * "WAN down"), host unreachable otherwise; private destinations never leave toward the cloud.
 * The link layer concludes the arrival as 'forwarded' (layer 3) when it sends the packet on.
 */
export class PacketForwarder {
  private readonly responder: IcmpResponder
  /** Pack 5.2 egress hook (NAT inside→outside, ACL out), after routing. */
  private readonly policy: PacketPolicy

  constructor(responder: IcmpResponder, policy: PacketPolicy) {
    this.responder = responder
    this.policy = policy
  }

  forward(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event } = delivery
    const { dst } = packet
    const cause: ErrorCause = {
      packet,
      ids: delivery.ids,
      causeEventId: event.id,
      linkBroadcast: delivery.linkBroadcast,
      ingressInterfaceId: delivery.interfaceId,
      event,
    }
    if (packet.ttl <= 1) {
      event.note(3, 'in', L3Notes.of('ttlExpired', { src: packet.src }))
      event.conclude('dropped', 3, 'ttlExpired')
      this.responder.error(ctx, cause, { type: 'timeExceeded' }, [L3Notes.of('timeExceededSent', { dst: packet.src })])
      return
    }
    const resolved = RouteLookup.resolve(ctx.runtime.network.routes, dst)
    if (!resolved) {
      if (Ipv4.isPublic(dst)) {
        event.note(3, 'in', L3Notes.of('noRoutePublic', { dst }))
        event.conclude('dropped', 3, 'noRoute')
        return
      }
      event.note(3, 'in', L3Notes.of('noRoute', { dst }))
      event.conclude('dropped', 3, 'noRoute')
      this.responder.error(ctx, cause, { type: 'unreachable', code: 'host' })
      return
    }
    const { entry, exitInterfaceId, nextHopIp } = resolved
    const exit = L3Interfaces.find(ctx.device, exitInterfaceId)
    if (exit && InterfaceAddresses.isCloudFacing(ctx.topology, exit) && !Ipv4.isPublic(dst)) {
      event.note(3, 'in', L3Notes.of('privateToInternet', { dst }))
      event.conclude('dropped', 3, 'privateToInternet')
      this.responder.error(ctx, cause, { type: 'unreachable', code: 'host' })
      return
    }
    const route = { dst, prefix: entry.prefix, length: entry.prefixLength, iface: exitInterfaceId }
    event.note(3, 'out', entry.nextHop === null ? L3Notes.of('connectedRoute', route) : L3Notes.of('routeFound', { ...route, via: nextHopIp }))
    event.note(3, 'out', L3Notes.of('ttlDecremented', { from: packet.ttl, to: packet.ttl - 1 }))
    const verdict = this.policy.egress(ctx, { ingressInterfaceId: delivery.interfaceId, exitInterfaceId, packet: { ...packet, ttl: packet.ttl - 1 }, event })
    if (verdict.kind === 'drop') {
      event.conclude('dropped', 3, verdict.reason)
      if (verdict.icmp !== undefined) this.responder.error(ctx, cause, { type: 'unreachable', code: verdict.icmp })
      return
    }
    ctx.layers.link.send(ctx, {
      interfaceId: exitInterfaceId,
      nextHopIp,
      packet: verdict.packet,
      ids: { ...delivery.ids, frameId: ctx.newFrameId() },
      event,
      ingressInterfaceId: delivery.interfaceId,
    })
  }
}
