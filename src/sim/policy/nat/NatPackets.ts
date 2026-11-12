// How NAT sees and rewrites an IPv4 packet: the flow's protocol and ports (the ICMP echo identifier
// plays the port role, SECURITY_PACK.md §8), and the header rewrites. ICMP errors carry the packet
// they quote: an inbound error about a translated flow has its quote translated back too.
import type { IcmpError, Ipv4Packet, IpQuote, TransportQuote } from '../../contract'
import type { NatEndpoint } from '../../contract/SecurityRuntime'

export type NatProtocol = 'icmp' | 'tcp' | 'udp'

/** The translatable part of a packet; null = a payload NAT cannot key (OSPF, GRE …). */
export interface NatFlow {
  readonly protocol: NatProtocol
  readonly src: NatEndpoint
  readonly dst: NatEndpoint
  /** TCP FIN or RST seen: the flow is closing (finrst-timeout). */
  readonly closing: boolean
}

/** An inbound ICMP error and the flow it quotes (src = our inside global side). */
export interface QuotedFlow {
  readonly error: IcmpError
  readonly flow: NatFlow
}

function quotedFlow(quote: IpQuote): NatFlow | null {
  const transport = quote.transport
  if (transport.kind === 'other') return null
  if (transport.kind === 'icmp') {
    return { protocol: 'icmp', src: { ip: quote.src, port: transport.identifier }, dst: { ip: quote.dst, port: transport.identifier }, closing: false }
  }
  return { protocol: transport.kind, src: { ip: quote.src, port: transport.srcPort }, dst: { ip: quote.dst, port: transport.dstPort }, closing: false }
}

function withQuotePort(transport: TransportQuote, port: number | undefined): TransportQuote {
  if (port === undefined || transport.kind === 'other') return transport
  if (transport.kind === 'icmp') return { ...transport, identifier: port }
  return { ...transport, srcPort: port }
}

export class NatPackets {
  /** The flow of an echo, UDP or TCP packet; null for ICMP errors and other payloads. */
  static flowOf(packet: Ipv4Packet): NatFlow | null {
    const payload = packet.payload
    switch (payload.kind) {
      case 'icmp':
        if (payload.type !== 'echoRequest' && payload.type !== 'echoReply') return null
        return { protocol: 'icmp', src: { ip: packet.src, port: payload.identifier }, dst: { ip: packet.dst, port: payload.identifier }, closing: false }
      case 'udp':
        return { protocol: 'udp', src: { ip: packet.src, port: payload.srcPort }, dst: { ip: packet.dst, port: payload.dstPort }, closing: false }
      case 'tcp': {
        const closing = payload.flags.includes('fin') || payload.flags.includes('rst')
        return { protocol: 'tcp', src: { ip: packet.src, port: payload.srcPort }, dst: { ip: packet.dst, port: payload.dstPort }, closing }
      }
      default:
        return null
    }
  }

  /** An ICMP error and the flow it quotes; null for anything else. */
  static quotedOf(packet: Ipv4Packet): QuotedFlow | null {
    const payload = packet.payload
    if (payload.kind !== 'icmp' || (payload.type !== 'destinationUnreachable' && payload.type !== 'timeExceeded')) return null
    const flow = quotedFlow(payload.original)
    return flow === null ? null : { error: payload, flow }
  }

  /** New source address (and port / echo identifier when given). */
  static withSource(packet: Ipv4Packet, source: NatEndpoint): Ipv4Packet {
    return { ...packet, src: source.ip, payload: NatPackets.withPort(packet, source.port, 'src') }
  }

  /** New destination address (and port / echo identifier when given). */
  static withDestination(packet: Ipv4Packet, destination: NatEndpoint): Ipv4Packet {
    return { ...packet, dst: destination.ip, payload: NatPackets.withPort(packet, destination.port, 'dst') }
  }

  /** An inbound ICMP error: destination and the quoted source become the inside local endpoint. */
  static withQuotedSource(packet: Ipv4Packet, error: IcmpError, local: NatEndpoint): Ipv4Packet {
    const original: IpQuote = { ...error.original, src: local.ip, transport: withQuotePort(error.original.transport, local.port) }
    return { ...packet, dst: local.ip, payload: { ...error, original } }
  }

  private static withPort(packet: Ipv4Packet, port: number | undefined, side: 'src' | 'dst'): Ipv4Packet['payload'] {
    const payload = packet.payload
    if (port === undefined) return payload
    switch (payload.kind) {
      case 'icmp':
        return payload.type === 'echoRequest' || payload.type === 'echoReply' ? { ...payload, identifier: port } : payload
      case 'udp':
      case 'tcp':
        return side === 'src' ? { ...payload, srcPort: port } : { ...payload, dstPort: port }
      default:
        return payload
    }
  }
}
