import type { Device, Port } from '../../domain'
import { HostAttachment } from '../../net/HostAttachment'
import { Ipv4 } from '../../net/Ipv4'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { InterfaceStatus } from '../../net/InterfaceStatus'
import {
  BROADCAST_MAC,
  type DeviceContext,
  type Ipv4Packet,
  type Ipv4SendResult,
  type LinkSend,
  type OsiLayer,
  PduLayers,
  SIM_TIMING,
  type SimProtocol,
  UNSPECIFIED_IP,
} from '../contract'
import { LinkTables } from './LinkTables'

const PROTOCOL_LAYER: Record<SimProtocol, OsiLayer> = {
  ethernet: 2,
  hdlc: 2,
  arp: 2,
  ipv4: 3,
  icmp: 3,
  udp: 4,
  tcp: 4,
  dhcp: 7,
  dns: 7,
  http: 7,
  telnet: 7,
  ssh: 7,
}

/**
 * Flow of the start-up traffic at engine creation. What devices learn from it is flushed by
 * `LinkLayer.onSettled` (coordinator decision 3: empty MAC tables and ARP caches after `settle`).
 */
export const BOOT_FLOW = 'boot'

/** Flow id of traffic a device starts by itself: 'boot' at engine creation, 'bg:<id>' later. */
export function spontaneousFlow(ctx: DeviceContext): string {
  return ctx.now === 0 ? BOOT_FLOW : `bg:${ctx.device.id}`
}

/** What the link layer needs to know about a device's layer-3 interfaces and ports. */
export class LinkInterfaces {
  static port(device: Device, portId: string): Port | undefined {
    return device.ports.find((port) => port.id === portId)
  }

  /** Source MAC of frames from the interface: the physical port's MAC; SVIs use the device's base MAC. */
  static macOf(device: Device, iface: L3Interface): string {
    if (iface.kind === 'svi' || iface.portId === undefined) return device.baseMac
    return LinkInterfaces.port(device, iface.portId)?.mac ?? device.baseMac
  }

  /**
   * The interface lost its address to duplicate address detection: only NICs and SVIs of a device that
   * does not route can (L3Interfaces.givesUpOnConflict, engine parity); the others defend their address.
   */
  static lostAddress(ctx: DeviceContext, iface: L3Interface): boolean {
    if (!L3Interfaces.givesUpOnConflict(ctx.device, iface)) return false
    const claim = LinkTables.claim(ctx, iface.id)
    return claim !== undefined && claim.duplicate && claim.address === iface.address
  }

  /**
   * Does the interface answer ARP for its own address? NICs never answer for an address that is not a
   * valid host address of their subnet; NICs and management SVIs of a non-routing device never answer
   * for a duplicate (coordinator decision 4); router-side interfaces of routers always answer.
   */
  static answersFor(ctx: DeviceContext, iface: L3Interface, ip: string): boolean {
    if (iface.address !== ip || !L3Interfaces.isAddressed(iface) || !iface.adminUp) return false
    if (LinkInterfaces.lostAddress(ctx, iface)) return false
    return L3Interfaces.isNetworkSide(iface) || Ipv4.isHostAddress(iface.address, iface.mask)
  }

  /** Link up and the interface administratively up (InterfaceStatus.isUp: SVIs need their VLAN). */
  static isUsable(ctx: DeviceContext, iface: L3Interface): boolean {
    return InterfaceStatus.isUp(ctx.topology, iface)
  }

  /** LinkLayer.interfaceReady for an interface of a device that is not the cloud. */
  static readiness(ctx: DeviceContext, iface: L3Interface): Ipv4SendResult {
    if (iface.kind === 'nic' || iface.kind === 'svi') {
      const attachment = HostAttachment.attach(ctx.topology, iface)
      if (!attachment.ok) return { ok: false, reason: attachment.reason }
    }
    if (!LinkInterfaces.isUsable(ctx, iface)) {
      const port = iface.portId === undefined ? undefined : LinkInterfaces.port(ctx.device, iface.portId)
      return { ok: false, reason: !iface.adminUp || port?.adminUp === false ? 'portDisabled' : 'cableDisconnected' }
    }
    if (LinkInterfaces.lostAddress(ctx, iface)) return { ok: false, reason: 'ipConflict' }
    return { ok: true, src: iface.address === '' ? UNSPECIFIED_IP : iface.address, interfaceId: iface.id }
  }

  /** ARP entries of end devices age like Windows; routers and switches like IOS. */
  static arpAgeMs(device: Device): number {
    return device.host ? SIM_TIMING.arpAgeHostMs : SIM_TIMING.arpAgeRouterMs
  }

  /** The next hop is a broadcast (limited, or the directed broadcast of the interface's subnet). */
  static isBroadcastHop(iface: L3Interface, ip: string): boolean {
    return Ipv4.isBroadcastFor(ip, iface.address, iface.mask)
  }

  /** Group bit of the first octet: broadcast and multicast MACs. */
  static isGroupMac(mac: string): boolean {
    if (mac === BROADCAST_MAC) return true
    const first = Number.parseInt(mac.slice(0, 2), 16)
    return Number.isInteger(first) && first % 2 === 1
  }

  /** Highest OSI layer of a packet's content (the layer of an event that only carries it). */
  static layerOf(packet: Ipv4Packet): OsiLayer {
    return PROTOCOL_LAYER[PduLayers.protocolOf(packet)]
  }

  /** Events opened by the task's arrival carry a routed packet: it is 'forwarded' at layer 3. */
  static isRouted(ctx: DeviceContext, eventId: number): boolean {
    return ctx.arrival !== null && ctx.arrival.id === eventId
  }

  /**
   * Frame id of a sent packet: `ids.frameId` (the network layer gives routed packets a new one). A routed
   * packet that still carries the arriving frame's id gets a new one here, so the loop guard never sees
   * a re-encapsulated packet as the same frame.
   */
  static frameIdFor(ctx: DeviceContext, request: LinkSend): string {
    const reused = LinkInterfaces.isRouted(ctx, request.event.id) && request.ids.frameId === ctx.arrival?.frameId
    return reused ? ctx.newFrameId() : request.ids.frameId
  }
}
