// The real (untranslated) addresses of a forwarded packet at the firewall's egress step. The firewall is
// last on egress (§5.1: NAT → ACL → firewall), so an inside → outside packet already carries its inside
// global source; the connection table stores real addresses (§5.2), so that source is mapped back through
// the NAT table that just translated it. Outside → inside packets were un-NATed on ingress already.
// Read-only over the NAT configuration and runtime: no counter or entry changes here.
import type { Device } from '../../../domain'
import type { DeviceContext } from '../../contract'
import type { FirewallEndpoint } from '../../contract/FirewallRuntime'
import { NatConfig } from '../nat/NatConfig'
import { NatRuntime } from '../nat/NatRuntime'
import { NatTable } from '../nat/NatTable'
import type { FirewallFlow } from './FirewallFlows'

export class FirewallNatView {
  /** `flow` with its real source when NAT translated it between these two interfaces; else `flow` itself. */
  static real(ctx: DeviceContext, device: Device, ingressInterfaceId: string, exitInterfaceId: string, flow: FirewallFlow): FirewallFlow {
    const nat = NatConfig.of(device)
    if (nat === undefined) return flow
    if (NatConfig.roleOf(device, ingressInterfaceId) !== 'inside' || NatConfig.roleOf(device, exitInterfaceId) !== 'outside') return flow
    const rows = [...NatConfig.staticRows(nat), ...NatRuntime.alive(NatRuntime.stored(ctx.runtime).translations, ctx.now)]
    // The answer to this packet would arrive from flow.dst to flow.src: the row that un-NATs it maps back.
    const entry = NatTable.inbound(rows, { protocol: flow.protocol, src: flow.dst, dst: flow.src, closing: false })
    if (entry === undefined) return flow
    const src: FirewallEndpoint = { ip: entry.insideLocal.ip, port: entry.protocol === 'any' ? flow.src.port : (entry.insideLocal.port ?? flow.src.port) }
    return { ...flow, src }
  }
}
