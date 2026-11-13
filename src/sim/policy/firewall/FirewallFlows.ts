// How the stateful firewall sees an IPv4 packet (docs/FIREWALL_PACK.md §5.1): the 5-tuple of a TCP / UDP
// segment or an ICMP echo (the echo identifier plays the port role on both sides), and the flow an ICMP
// error quotes. Other payloads (OSPF, GRE …) have no flow: they follow the level rules only.
import type { Ipv4Packet, IpQuote, TcpFlag } from '../../contract'
import type { FirewallEndpoint } from '../../contract/FirewallRuntime'

export type FirewallProtocol = 'tcp' | 'udp' | 'icmp'

export interface FirewallFlow {
  readonly protocol: FirewallProtocol
  readonly src: FirewallEndpoint
  readonly dst: FirewallEndpoint
  /** TCP flags of the segment; empty for UDP and ICMP. */
  readonly tcpFlags: readonly TcpFlag[]
  /** ICMP echo direction; null for TCP and UDP. */
  readonly echo: 'request' | 'reply' | null
}

const NO_FLAGS: readonly TcpFlag[] = []

function quotedFlow(quote: IpQuote): FirewallFlow | null {
  const transport = quote.transport
  switch (transport.kind) {
    case 'icmp': {
      const echo = transport.type === 'echoRequest' ? 'request' : 'reply'
      return { protocol: 'icmp', src: { ip: quote.src, port: transport.identifier }, dst: { ip: quote.dst, port: transport.identifier }, tcpFlags: NO_FLAGS, echo }
    }
    case 'tcp':
    case 'udp':
      return { protocol: transport.kind, src: { ip: quote.src, port: transport.srcPort }, dst: { ip: quote.dst, port: transport.dstPort }, tcpFlags: NO_FLAGS, echo: null }
    default:
      return null
  }
}

export class FirewallFlows {
  /** The flow of a TCP, UDP or ICMP echo packet; null for ICMP errors and other payloads. */
  static of(packet: Ipv4Packet): FirewallFlow | null {
    const payload = packet.payload
    switch (payload.kind) {
      case 'icmp': {
        if (payload.type !== 'echoRequest' && payload.type !== 'echoReply') return null
        const echo = payload.type === 'echoRequest' ? 'request' : 'reply'
        return { protocol: 'icmp', src: { ip: packet.src, port: payload.identifier }, dst: { ip: packet.dst, port: payload.identifier }, tcpFlags: NO_FLAGS, echo }
      }
      case 'udp':
        return { protocol: 'udp', src: { ip: packet.src, port: payload.srcPort }, dst: { ip: packet.dst, port: payload.dstPort }, tcpFlags: NO_FLAGS, echo: null }
      case 'tcp':
        return { protocol: 'tcp', src: { ip: packet.src, port: payload.srcPort }, dst: { ip: packet.dst, port: payload.dstPort }, tcpFlags: payload.flags, echo: null }
      default:
        return null
    }
  }

  /** The flow an ICMP error (unreachable, time exceeded) quotes; null for anything else. */
  static quotedOf(packet: Ipv4Packet): FirewallFlow | null {
    const payload = packet.payload
    if (payload.kind !== 'icmp' || (payload.type !== 'destinationUnreachable' && payload.type !== 'timeExceeded')) return null
    return quotedFlow(payload.original)
  }

  /** A TCP segment that may open a connection: SYN without ACK. */
  static isTcpOpener(flags: readonly TcpFlag[]): boolean {
    return flags.includes('syn') && !flags.includes('ack')
  }

  /**
   * True when the packet may create a connection (§5.1 step 7): a TCP SYN, any UDP datagram, an ICMP echo
   * request while ICMP is inspected (D2).
   */
  static opens(flow: FirewallFlow, inspectIcmp: boolean): boolean {
    switch (flow.protocol) {
      case 'tcp':
        return FirewallFlows.isTcpOpener(flow.tcpFlags)
      case 'udp':
        return true
      case 'icmp':
        return inspectIcmp && flow.echo === 'request'
    }
  }

  /** '192.168.1.10:1024'. */
  static endpoint(endpoint: FirewallEndpoint): string {
    return `${endpoint.ip}:${endpoint.port}`
  }
}
