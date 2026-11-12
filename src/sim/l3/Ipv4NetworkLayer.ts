import type {
  DeviceContext,
  Ipv4Delivery,
  Ipv4Send,
  Ipv4SendResult,
  NetworkLayer,
  NetworkTimer,
  SimRequest,
  Undeliverable,
} from '../contract'
import type { PacketPolicy } from '../policy/PacketPolicy'
import { SecurityPolicies } from '../policy/SecurityPolicies'
import { CloudStack } from './CloudStack'
import { EchoClients } from './EchoClients'
import { IcmpResponder } from './IcmpResponder'
import { L3Notes } from './L3Notes'
import { NetworkRuntimes } from './NetworkRuntimes'
import { PacketForwarder } from './PacketForwarder'
import { PacketReceiver } from './PacketReceiver'
import { type LocalStack, PacketSender } from './PacketSender'
import { RouteTableBuilder } from './RouteTableBuilder'

/**
 * S2, the network layer (docs/SIMULATION.md §7.2): IPv4 for hosts, routers, L3 switches and the ISP
 * cloud; ICMP; the transport demux; the ping and tracert clients. Stateless: everything a device
 * learns lives in its `runtime.network` slice.
 */
export class Ipv4NetworkLayer implements NetworkLayer, LocalStack {
  private readonly sender: PacketSender
  private readonly responder: IcmpResponder
  private readonly clients: EchoClients
  private readonly receiver: PacketReceiver

  /** `policy`: the pack 5.2 chain (ACL, NAT); tests may pass their own. */
  constructor(policy: PacketPolicy = SecurityPolicies.create()) {
    this.sender = new PacketSender(this)
    this.responder = new IcmpResponder(this.sender)
    this.clients = new EchoClients(this.sender)
    this.receiver = new PacketReceiver({
      responder: this.responder,
      clients: this.clients,
      forwarder: new PacketForwarder(this.responder, policy),
      cloud: new CloudStack(this.responder),
      policy,
    })
  }

  /** The routing table is derived from the configuration (rebuilt on start and every change). */
  onStart(ctx: DeviceContext): void {
    NetworkRuntimes.setRoutes(ctx, RouteTableBuilder.build(ctx.topology, ctx.device))
  }

  /** Routes follow configuration and link status; running pings and tracerts survive. */
  onChange(ctx: DeviceContext): void {
    NetworkRuntimes.setRoutes(ctx, RouteTableBuilder.build(ctx.topology, ctx.device))
  }

  onPacket(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    this.receiver.receive(ctx, delivery)
  }

  deliverLocal(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    this.receiver.deliverLocal(ctx, delivery)
  }

  send(ctx: DeviceContext, request: Ipv4Send): Ipv4SendResult {
    return this.sender.send(ctx, request)
  }

  /**
   * ARP failed. A forwarded packet: ICMP host unreachable from the interface it arrived on. An own
   * packet: Windows reports "Destination host unreachable" from its own address (ping / tracert), the
   * services hear it as a local ICMP error.
   */
  onUndeliverable(ctx: DeviceContext, failure: Undeliverable): void {
    const { packet } = failure
    if (failure.ingressInterfaceId !== undefined) {
      this.responder.error(
        ctx,
        { packet, ids: failure.ids, causeEventId: failure.droppedEventId, linkBroadcast: false, ingressInterfaceId: failure.ingressInterfaceId },
        { type: 'unreachable', code: 'host' },
        [L3Notes.of('arpFailedUnreachable', { ip: failure.nextHopIp, dst: packet.src })],
      )
      return
    }
    const payload = packet.payload
    if (payload.kind === 'icmp' && payload.type === 'echoRequest') {
      this.clients.onError(ctx, packet.src, IcmpResponder.hostUnreachable(packet))
      return
    }
    if (payload.kind !== 'udp' && payload.kind !== 'tcp') return
    const event = ctx.openEvent({ flowId: failure.ids.flowId, protocol: payload.kind, causeEventId: failure.droppedEventId })
    event.note(3, 'in', L3Notes.of('arpFailedLocal', { ip: failure.nextHopIp }))
    event.conclude('delivered', 3)
    ctx.layers.services.onIcmpError(ctx, { reporterIp: packet.src, error: IcmpResponder.hostUnreachable(packet), local: true, event })
  }

  onTimer(ctx: DeviceContext, timer: NetworkTimer): void {
    this.clients.onTimer(ctx, timer)
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    this.clients.start(ctx, requestId, request)
  }
}
