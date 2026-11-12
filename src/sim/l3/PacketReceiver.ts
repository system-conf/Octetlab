import { L3Interfaces } from '../../net/L3Interfaces'
import {
  type DeviceContext,
  DeviceProfiles,
  type IcmpMessage,
  type Ipv4Delivery,
  type TcpSegment,
  type UdpDatagram,
} from '../contract'
import type { CloudStack } from './CloudStack'
import type { EchoClients } from './EchoClients'
import type { IcmpResponder } from './IcmpResponder'
import { InterfaceAddresses } from './InterfaceAddresses'
import { L3Notes } from './L3Notes'
import type { PacketPolicy } from '../policy/PacketPolicy'
import type { PacketForwarder } from './PacketForwarder'
import type { LocalStack } from './PacketSender'

/** Collaborators of the receive path. */
export interface ReceiverParts {
  readonly responder: IcmpResponder
  readonly clients: EchoClients
  readonly forwarder: PacketForwarder
  readonly cloud: CloudStack
  /** Pack 5.2 ingress hook (ACL in, NAT outside→inside) for routers and L3 switches. */
  readonly policy: PacketPolicy
}

/**
 * IPv4 packets the link layer accepted (docs/SIMULATION.md §7.2): for this device (own address or a
 * broadcast) → ICMP or the transport demux; else routers forward and hosts drop (`notRouting`).
 * Closed UDP ports answer ICMP port unreachable, closed TCP ports a RST. Handing a datagram or an error
 * to the services concludes the event first; the services may conclude it again (last call wins).
 */
export class PacketReceiver implements LocalStack {
  private readonly parts: ReceiverParts

  constructor(parts: ReceiverParts) {
    this.parts = parts
  }

  receive(ctx: DeviceContext, arrival: Ipv4Delivery): void {
    const { event } = arrival
    event.note(3, 'in', L3Notes.of('packetReceived', { src: arrival.packet.src, dst: arrival.packet.dst, ttl: arrival.packet.ttl }))
    const profile = DeviceProfiles.of(ctx.device)
    if (profile.isp) return this.parts.cloud.receive(ctx, arrival)
    if (profile.ipRole === 'none') return event.conclude('dropped', 3, 'unsupported')
    const router = profile.ipRole === 'router'
    const delivery = router ? this.admitted(ctx, arrival) : arrival
    if (!delivery) return
    const { packet } = delivery
    const ingress = L3Interfaces.find(ctx.device, delivery.interfaceId)
    if (InterfaceAddresses.isBroadcastFor(ingress, packet.dst)) {
      event.note(3, 'in', L3Notes.of('broadcastReceived', { dst: packet.dst }))
      return this.deliverLocal(ctx, delivery)
    }
    if (InterfaceAddresses.owner(ctx.topology, ctx.device, packet.dst, router)) {
      event.note(3, 'in', L3Notes.of('forThisDevice', { dst: packet.dst }))
      return this.deliverLocal(ctx, delivery)
    }
    if (router) return this.parts.forwarder.forward(ctx, delivery)
    event.note(3, 'in', L3Notes.of('notRouting', { dst: packet.dst }))
    event.conclude('dropped', 3, 'notRouting')
  }

  /** The arrival after the ingress policies (possibly translated), or null when they dropped it. */
  private admitted(ctx: DeviceContext, arrival: Ipv4Delivery): Ipv4Delivery | null {
    const { packet, event } = arrival
    const verdict = this.parts.policy.ingress(ctx, { interfaceId: arrival.interfaceId, packet, linkBroadcast: arrival.linkBroadcast, event })
    if (verdict.kind === 'pass') return verdict.packet === packet ? arrival : { ...arrival, packet: verdict.packet }
    event.conclude('dropped', 3, verdict.reason)
    if (verdict.icmp !== undefined) {
      this.parts.responder.error(
        ctx,
        { packet, ids: arrival.ids, causeEventId: event.id, linkBroadcast: arrival.linkBroadcast, ingressInterfaceId: arrival.interfaceId, event },
        { type: 'unreachable', code: verdict.icmp },
      )
    }
    return null
  }

  /** Demultiplexes a packet for this device by IP protocol. */
  deliverLocal(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const payload = delivery.packet.payload
    switch (payload.kind) {
      case 'icmp':
        return this.icmp(ctx, delivery, payload)
      case 'udp':
      case 'tcp':
        return this.transport(ctx, delivery, payload)
    }
  }

  private icmp(ctx: DeviceContext, delivery: Ipv4Delivery, message: IcmpMessage): void {
    const { packet, event } = delivery
    switch (message.type) {
      case 'echoRequest': {
        const ingress = L3Interfaces.find(ctx.device, delivery.interfaceId)
        if (delivery.linkBroadcast || InterfaceAddresses.isBroadcastFor(ingress, packet.dst)) {
          event.note(3, 'in', L3Notes.of('echoBroadcastIgnored'))
          return event.conclude('delivered', 3)
        }
        event.note(3, 'in', L3Notes.of('echoRequestReceived', { sequence: message.sequence, src: packet.src }))
        event.conclude('replied', 3)
        return this.parts.responder.echoReply(ctx, packet, message, { flowId: delivery.ids.flowId, causeEventId: event.id })
      }
      case 'echoReply':
        if (this.parts.clients.onEchoReply(ctx, packet, message)) {
          event.note(3, 'in', L3Notes.of('echoReplyReceived', { src: packet.src }))
          return event.conclude('delivered', 3)
        }
        event.note(3, 'in', L3Notes.of('echoReplyStale', { src: packet.src }))
        return event.conclude('dropped', 3, 'staleReply')
      case 'destinationUnreachable':
      case 'timeExceeded': {
        const key = message.type === 'timeExceeded' ? 'timeExceededReceived' : 'unreachableReceived'
        event.note(3, 'in', L3Notes.of(key, { src: packet.src }))
        const transport = message.original.transport
        if (transport.kind === 'udp' || transport.kind === 'tcp') {
          event.conclude('delivered', 3)
          return ctx.layers.services.onIcmpError(ctx, { reporterIp: packet.src, error: message, local: false, event })
        }
        if (transport.kind === 'icmp' && !this.parts.clients.onError(ctx, packet.src, message)) {
          return event.conclude('dropped', 3, 'staleReply')
        }
        return event.conclude('delivered', 3)
      }
    }
  }

  private transport(ctx: DeviceContext, delivery: Ipv4Delivery, segment: UdpDatagram | TcpSegment): void {
    const { packet, event } = delivery
    const protocol = segment.kind.toUpperCase()
    if (ctx.layers.services.listens(ctx, segment.kind, packet.dst, segment.dstPort)) {
      event.note(4, 'in', L3Notes.of('toTransport', { protocol, port: segment.dstPort }))
      event.conclude('delivered', 4)
      return ctx.layers.services.onDatagram(ctx, { interfaceId: delivery.interfaceId, packet, ids: delivery.ids, linkSourceMac: delivery.linkSourceMac, event })
    }
    event.conclude('dropped', 4, 'portUnreachable')
    if (segment.kind === 'tcp') {
      if (delivery.linkBroadcast || InterfaceAddresses.isGroupAddress(packet.dst)) return
      return this.parts.responder.reset(ctx, packet, segment, event.id, delivery.ids.flowId)
    }
    event.note(4, 'in', L3Notes.of('portUnreachable', { protocol, port: segment.dstPort }))
    this.parts.responder.error(
      ctx,
      { packet, ids: delivery.ids, causeEventId: event.id, linkBroadcast: delivery.linkBroadcast, ingressInterfaceId: delivery.interfaceId, sourceIp: packet.dst, event },
      { type: 'unreachable', code: 'port' },
    )
  }
}
