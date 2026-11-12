import {
  type DeviceContext,
  type Ipv4Delivery,
  type Ipv4Send,
  type Ipv4SendResult,
  type LinkLayer,
  type LinkSend,
  type NetworkLayer,
  PingTally,
  type RequestResult,
  type ServiceLayer,
  type SimLayers,
  type SimRequest,
  type TransportDelivery,
} from '../contract'
import type { NetworkState } from '../../domain'

/**
 * Layers that do nothing but answer correctly: every PDU is dropped as `unsupported`, every request
 * ends at once. For wiring before S1–S3 exist and for testing one layer with the others switched off.
 */
class NullLinkLayer implements LinkLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}

  onFrame(ctx: DeviceContext): void {
    ctx.arrival?.conclude('dropped', 1, 'unsupported')
  }

  send(_ctx: DeviceContext, request: LinkSend): void {
    request.event.conclude('dropped', 2, 'unsupported')
  }

  onRequest(ctx: DeviceContext, requestId: string): void {
    ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
  }

  interfaceReady(): Ipv4SendResult {
    return { ok: false, reason: 'unsupported' }
  }
}

class NullNetworkLayer implements NetworkLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}
  onUndeliverable(): void {}

  onPacket(_ctx: DeviceContext, delivery: Ipv4Delivery): void {
    delivery.event.conclude('dropped', 3, 'unsupported')
  }

  send(ctx: DeviceContext, request: Ipv4Send): Ipv4SendResult {
    ctx.openEvent({ flowId: request.ids.flowId, ids: request.ids }).conclude('dropped', 3, 'unsupported')
    return { ok: false, reason: 'unsupported' }
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    ctx.report(requestId, NullResults.of(request), true)
  }
}

class NullServiceLayer implements ServiceLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}
  onIcmpError(): void {}

  listens(): boolean {
    return false
  }

  onDatagram(_ctx: DeviceContext, delivery: TransportDelivery): void {
    delivery.event.conclude('dropped', 4, 'unsupported')
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    ctx.report(requestId, NullResults.of(request), true)
  }

  applyEffect(state: NetworkState): NetworkState {
    return state
  }
}

class NullResults {
  static of(request: SimRequest): RequestResult {
    switch (request.kind) {
      case 'ping':
        return PingTally.of([{ kind: 'localFailure', sequence: 1, reason: 'unsupported' }])
      case 'tracert':
        return { kind: 'tracert', hops: [], ending: { kind: 'localFailure', reason: 'unsupported' } }
      case 'dhcpRenew':
      case 'dhcpRelease':
        return { kind: 'dhcp', operation: request.kind === 'dhcpRenew' ? 'renew' : 'release', adapters: [], effects: [] }
      case 'dnsQuery':
        return { kind: 'dns', name: request.name, answer: { ok: false, reason: 'dnsUnreachable' } }
      case 'httpGet':
        return { kind: 'http', outcome: { ok: false, reason: 'unsupported' } }
      case 'clearTable':
        return { kind: 'cleared', entries: 0 }
      case 'remoteConnect':
        return { kind: 'remoteConnect', protocol: request.protocol, targetIp: request.targetIp, outcome: { ok: false, failure: 'localFailure', reason: 'unsupported' } }
    }
  }
}

export const nullLayers: SimLayers = {
  link: new NullLinkLayer(),
  network: new NullNetworkLayer(),
  services: new NullServiceLayer(),
}
