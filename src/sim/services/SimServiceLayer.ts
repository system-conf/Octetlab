import type { NetworkState } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { RuntimeTables } from '../core/RuntimeTables'
import {
  type DeviceChange,
  type DeviceContext,
  DeviceProfiles,
  type EventBuilder,
  type IcmpErrorReport,
  type ServiceLayer,
  type ServiceTimer,
  SIM_PORTS,
  type SimRequest,
  type StateEffect,
  type TransportDelivery,
} from '../contract'
import { DhcpClient } from './DhcpClient'
import { DhcpEffects } from './DhcpEffects'
import { DhcpRequests } from './DhcpRequests'
import { DhcpServer } from './DhcpServer'
import { DnsClient } from './DnsClient'
import { DnsServer } from './DnsServer'
import { HttpClient } from './HttpClient'
import { RemoteConnectStub } from './remote/RemoteConnectStub'
import { ServiceChanges } from './ServiceChanges'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { WebServer } from './WebServer'

/**
 * The services layer (S3, docs/SIMULATION.md §6.3, §7.3): DHCP server / relay / client, DNS client /
 * server / forwarder and the internet's public resolvers, HTTP client and the internet's web servers.
 * Stateless: everything a device learns lives in its `runtime.services` slice.
 */
export class SimServiceLayer implements ServiceLayer {
  onStart(): void {}

  onChange(ctx: DeviceContext, change: DeviceChange): void {
    ServiceChanges.apply(ctx, change)
  }

  listens(ctx: DeviceContext, protocol: 'udp' | 'tcp', dstIp: string, dstPort: number): boolean {
    if (protocol === 'udp') {
      if (dstPort === SIM_PORTS.dhcpServer) return DhcpServer.listens(ctx)
      if (dstPort === SIM_PORTS.dhcpClient) return DhcpClient.listens(ctx)
      if (dstPort === SIM_PORTS.dns && DnsServer.listensOn(ctx, dstIp)) return true
      return DnsClient.listens(ctx, dstPort) || DnsServer.forwardListens(ctx, dstPort)
    }
    if (DeviceProfiles.of(ctx.device).isp && dstPort === SIM_PORTS.http && Ipv4.isPublic(dstIp)) return true
    return HttpClient.listens(ctx, dstPort)
  }

  onDatagram(ctx: DeviceContext, delivery: TransportDelivery): void {
    const transport = delivery.packet.payload
    const { event } = delivery
    if (transport.kind === 'udp') {
      const app = transport.payload
      if (app.kind === 'dhcp' && transport.dstPort === SIM_PORTS.dhcpClient) {
        return DhcpClient.onMessage(ctx, delivery, app, DhcpRequests.onNicFinished)
      }
      if (app.kind === 'dhcp' && transport.dstPort === SIM_PORTS.dhcpServer) return DhcpServer.onMessage(ctx, delivery, app)
      if (app.kind === 'dns' && app.response) {
        if (DnsClient.onResponse(ctx, delivery, transport.dstPort, app)) return
        if (DnsServer.onForwardResponse(ctx, delivery, transport.dstPort, app)) return
        return SimServiceLayer.stale(event)
      }
      if (app.kind === 'dns' && transport.dstPort === SIM_PORTS.dns) return DnsServer.onQuery(ctx, delivery, transport, app)
    } else if (transport.kind === 'tcp') {
      if (DeviceProfiles.of(ctx.device).isp && transport.dstPort === SIM_PORTS.http) return WebServer.onSegment(ctx, delivery, transport)
      if (HttpClient.onSegment(ctx, delivery, transport)) return
      return SimServiceLayer.stale(event)
    }
    event.conclude('dropped', 4, 'unsupported')
  }

  onIcmpError(ctx: DeviceContext, report: IcmpErrorReport): void {
    const { original } = report.error
    const quote = original.transport
    if (quote.kind === 'udp') {
      if (DnsClient.onIcmpError(ctx, report, quote.srcPort, original.dst)) return
      if (DnsServer.onIcmpError(ctx, report, quote.srcPort, original.dst)) return
    } else if (quote.kind === 'tcp') {
      if (HttpClient.onIcmpError(ctx, report, quote.srcPort, original.dst)) return
    }
    SimServiceLayer.stale(report.event)
  }

  onTimer(ctx: DeviceContext, timer: ServiceTimer): void {
    switch (timer.kind) {
      case 'dhcpRetransmit':
        return DhcpClient.onTimer(ctx, timer, DhcpRequests.onNicFinished)
      case 'dnsTimeout':
        return DnsClient.onTimeout(ctx, timer.queryId)
      case 'dnsForwardTimeout':
        return DnsServer.onTimeout(ctx, timer.upstreamQueryId)
      case 'httpTimeout':
        return HttpClient.onTimeout(ctx, timer.requestId)
    }
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    switch (request.kind) {
      case 'dhcpRenew':
        return DhcpRequests.renew(ctx, requestId, request)
      case 'dhcpRelease':
        return DhcpRequests.release(ctx, requestId, request)
      case 'dnsQuery':
        return DnsClient.query(ctx, requestId, request)
      case 'httpGet':
        return HttpClient.get(ctx, requestId, request)
      case 'clearTable':
        if (request.table === 'dnsCache') return SimServiceLayer.flushDns(ctx, requestId)
        throw new Error(`clearTable ${request.table} belongs to the link layer`)
      case 'remoteConnect':
        return RemoteConnectStub.start(ctx, requestId, request)
      case 'ping':
      case 'tracert':
        throw new Error(`${request.kind} belongs to the network layer`)
    }
  }

  applyEffect(state: NetworkState, effect: StateEffect): NetworkState {
    return DhcpEffects.apply(state, effect)
  }

  /** `ipconfig /flushdns`: no packets, the live entries are counted. */
  private static flushDns(ctx: DeviceContext, requestId: string): void {
    const entries = RuntimeTables.dnsCache(ctx.runtime, ctx.now).length
    ServiceRuntimes.update(ctx, (services) => ({ ...services, dnsCache: [] }))
    ctx.report(requestId, { kind: 'cleared', entries }, true)
  }

  /** An answer nobody waits for (a late reply after a timeout, a closed exchange). */
  private static stale(event: EventBuilder): void {
    ServiceNotes.add(event, 'in', 'staleReply')
    event.conclude('dropped', 7, 'staleReply')
  }
}
