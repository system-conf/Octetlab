// Reading PDUs layer by layer (docs/SIMULATION.md §2.2): derived header numbers, the top-most protocol
// for filters, ICMP quotes, and the header-field view of the inspector. Field labels are translated
// (`simulation:fields.<field>`); field values are protocol notation and stay as they are (like a
// packet analyser), e.g. '0x0800 (IPv4)' or '8 (Echo request)'.
import type {
  ArpPacket,
  DhcpMessage,
  DhcpMessageType,
  DnsMessage,
  EthernetFrame,
  EthernetPayload,
  HttpMessage,
  IcmpMessage,
  IpQuote,
  Ipv4Packet,
  Ipv4Payload,
  Pdu,
  TcpSegment,
  UdpDatagram,
} from './Pdu'
import type { OsiLayer, SimProtocol } from './SimEvent'
import { SIM_PORTS } from './SimConstants'

export type PduFieldKey =
  | 'dstMac'
  | 'srcMac'
  | 'vlanId'
  | 'priority'
  | 'etherType'
  | 'hdlcProtocol'
  | 'arpOperation'
  | 'senderMac'
  | 'senderIp'
  | 'targetMac'
  | 'targetIp'
  | 'srcIp'
  | 'dstIp'
  | 'ttl'
  | 'identification'
  | 'ipProtocol'
  | 'icmpType'
  | 'icmpCode'
  | 'echoIdentifier'
  | 'echoSequence'
  | 'dataBytes'
  | 'quotedSrc'
  | 'quotedDst'
  | 'srcPort'
  | 'dstPort'
  | 'tcpFlags'
  | 'seqNumber'
  | 'ackNumber'
  | 'bootpOp'
  | 'dhcpMessageType'
  | 'transactionId'
  | 'clientMac'
  | 'clientIp'
  | 'yourIp'
  | 'serverIp'
  | 'relayIp'
  | 'broadcastFlag'
  | 'dhcpOptions'
  | 'dnsId'
  | 'dnsFlags'
  | 'responseCode'
  | 'question'
  | 'answer'
  | 'httpRequestLine'
  | 'httpHost'
  | 'httpStatus'
  | 'contentLength'
  | 'payloadBytes'

export interface PduField {
  readonly field: PduFieldKey
  readonly value: string
}

/** One header of a PDU, bottom-up. Layer 1 (the port) comes from the event, not from the PDU. */
export interface PduLayerView {
  readonly layer: OsiLayer
  readonly protocol: SimProtocol
  readonly fields: readonly PduField[]
}

const ICMP_TYPE_NAMES: Readonly<Record<IcmpMessage['type'], string>> = {
  echoReply: 'Echo reply',
  destinationUnreachable: 'Destination unreachable',
  echoRequest: 'Echo request',
  timeExceeded: 'Time exceeded',
}

const UNREACHABLE_CODES = { net: 0, host: 1, protocol: 2, port: 3, adminProhibited: 13 } as const

const BOOT_REQUESTS: ReadonlySet<DhcpMessageType> = new Set(['discover', 'request', 'decline', 'release', 'inform'])

function hex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`
}

function field(name: PduFieldKey, value: string | number | boolean): PduField {
  return { field: name, value: String(value) }
}

export class PduLayers {
  static etherType(payload: EthernetPayload): number {
    switch (payload.kind) {
      case 'arp':
        return 0x0806
      case 'ipv4':
        return 0x0800
    }
  }

  static ipProtocol(payload: Ipv4Payload): number {
    switch (payload.kind) {
      case 'icmp':
        return 1
      case 'tcp':
        return 6
      case 'udp':
        return 17
    }
  }

  static icmpNumbers(message: IcmpMessage): { type: number; code: number } {
    switch (message.type) {
      case 'echoReply':
        return { type: 0, code: 0 }
      case 'echoRequest':
        return { type: 8, code: 0 }
      case 'destinationUnreachable':
        return { type: 3, code: UNREACHABLE_CODES[message.code] }
      case 'timeExceeded':
        return { type: 11, code: 0 }
    }
  }

  /** BOOTP op: 1 BOOTREQUEST (client → server), 2 BOOTREPLY. */
  static dhcpOp(messageType: DhcpMessageType): 1 | 2 {
    return BOOT_REQUESTS.has(messageType) ? 1 : 2
  }

  /** The IPv4 packet inside a PDU, if any. */
  static ipv4Of(pdu: Pdu): Ipv4Packet | null {
    if (pdu.kind === 'ipv4') return pdu
    return pdu.payload.kind === 'ipv4' ? pdu.payload : null
  }

  /** Top-most protocol (event-list filter and colour). */
  static protocolOf(pdu: Pdu): SimProtocol {
    if (pdu.kind === 'ethernet' && pdu.payload.kind === 'arp') return 'arp'
    const packet = PduLayers.ipv4Of(pdu)
    if (!packet) return pdu.kind === 'ipv4' ? 'ipv4' : pdu.kind
    const transport = packet.payload
    switch (transport.kind) {
      case 'icmp':
        return 'icmp'
      case 'udp':
        if (transport.payload.kind === 'dhcp') return 'dhcp'
        return transport.payload.kind === 'dns' ? 'dns' : 'udp'
      case 'tcp':
        if (transport.payload?.kind === 'http') return 'http'
        return PduLayers.remoteAccessProtocol(transport.srcPort, transport.dstPort) ?? 'tcp'
    }
  }

  /** Pack 5.2: TCP 22 / 23 segments are SSH / Telnet (their payload is opaque RawData). */
  private static remoteAccessProtocol(srcPort: number, dstPort: number): 'ssh' | 'telnet' | null {
    if (srcPort === SIM_PORTS.ssh || dstPort === SIM_PORTS.ssh) return 'ssh'
    if (srcPort === SIM_PORTS.telnet || dstPort === SIM_PORTS.telnet) return 'telnet'
    return null
  }

  /**
   * The quote an ICMP error carries about `packet` (RFC 792: IP header + 8 bytes). `totalLength` = the
   * packet's IPv4 total length in bytes (the contract has no byte model: `FrameEncoder.ipv4Length`).
   */
  static quote(packet: Ipv4Packet, totalLength: number): IpQuote {
    const { src, dst, ttl, identification, payload } = packet
    const base = { src, dst, ttl, identification, totalLength }
    switch (payload.kind) {
      case 'icmp':
        return payload.type === 'echoRequest' || payload.type === 'echoReply'
          ? { ...base, transport: { kind: 'icmp', type: payload.type, identifier: payload.identifier, sequence: payload.sequence } }
          : { ...base, transport: { kind: 'other' } }
      case 'udp':
      case 'tcp':
        return { ...base, transport: { kind: payload.kind, srcPort: payload.srcPort, dstPort: payload.dstPort } }
    }
  }

  /** Header fields bottom-up: Ethernet / HDLC, ARP or IPv4, ICMP / UDP / TCP, application. */
  static describe(pdu: Pdu): PduLayerView[] {
    if (pdu.kind === 'ipv4') return PduLayers.describeIpv4(pdu)
    if (pdu.kind === 'hdlc') {
      const hdlc: PduLayerView = { layer: 2, protocol: 'hdlc', fields: [field('hdlcProtocol', `${hex(0x0800, 4)} (IPv4)`)] }
      return [hdlc, ...PduLayers.describeIpv4(pdu.payload)]
    }
    const ethernet: PduLayerView = { layer: 2, protocol: 'ethernet', fields: PduLayers.ethernetFields(pdu) }
    const payload = pdu.payload
    return payload.kind === 'arp' ? [ethernet, PduLayers.describeArp(payload)] : [ethernet, ...PduLayers.describeIpv4(payload)]
  }

  private static ethernetFields(frame: EthernetFrame): PduField[] {
    const name = frame.payload.kind === 'arp' ? 'ARP' : 'IPv4'
    const fields = [field('dstMac', frame.dst), field('srcMac', frame.src)]
    if (frame.tag) fields.push(field('vlanId', frame.tag.vid), field('priority', frame.tag.pcp))
    fields.push(field('etherType', `${hex(PduLayers.etherType(frame.payload), 4)} (${name})`))
    return fields
  }

  private static describeArp(arp: ArpPacket): PduLayerView {
    const operation = arp.operation === 'request' ? '1 (request)' : '2 (reply)'
    return {
      layer: 2,
      protocol: 'arp',
      fields: [
        field('arpOperation', operation),
        field('senderMac', arp.senderMac),
        field('senderIp', arp.senderIp),
        field('targetMac', arp.targetMac),
        field('targetIp', arp.targetIp),
      ],
    }
  }

  private static describeIpv4(packet: Ipv4Packet): PduLayerView[] {
    const transport = packet.payload
    const protocolName = transport.kind.toUpperCase()
    const ip: PduLayerView = {
      layer: 3,
      protocol: 'ipv4',
      fields: [
        field('srcIp', packet.src),
        field('dstIp', packet.dst),
        field('ttl', packet.ttl),
        field('identification', hex(packet.identification, 4)),
        field('ipProtocol', `${PduLayers.ipProtocol(transport)} (${protocolName})`),
      ],
    }
    switch (transport.kind) {
      case 'icmp':
        return [ip, PduLayers.describeIcmp(transport)]
      case 'udp':
        return [ip, ...PduLayers.describeUdp(transport)]
      case 'tcp':
        return [ip, ...PduLayers.describeTcp(transport)]
    }
  }

  private static describeIcmp(message: IcmpMessage): PduLayerView {
    const { type, code } = PduLayers.icmpNumbers(message)
    const fields = [field('icmpType', `${type} (${ICMP_TYPE_NAMES[message.type]})`), field('icmpCode', code)]
    if ('original' in message) {
      fields.push(field('quotedSrc', message.original.src), field('quotedDst', message.original.dst))
    } else {
      fields.push(field('echoIdentifier', message.identifier), field('echoSequence', message.sequence), field('dataBytes', message.dataBytes))
    }
    return { layer: 3, protocol: 'icmp', fields }
  }

  private static describeUdp(datagram: UdpDatagram): PduLayerView[] {
    const udp: PduLayerView = { layer: 4, protocol: 'udp', fields: [field('srcPort', datagram.srcPort), field('dstPort', datagram.dstPort)] }
    const payload = datagram.payload
    switch (payload.kind) {
      case 'dhcp':
        return [udp, PduLayers.describeDhcp(payload)]
      case 'dns':
        return [udp, PduLayers.describeDns(payload)]
      case 'data':
        return [{ ...udp, fields: [...udp.fields, field('payloadBytes', payload.bytes)] }]
    }
  }

  private static describeTcp(segment: TcpSegment): PduLayerView[] {
    const fields = [field('srcPort', segment.srcPort), field('dstPort', segment.dstPort), field('tcpFlags', segment.flags.map((flag) => flag.toUpperCase()).join(', '))]
    if (segment.seq !== undefined) fields.push(field('seqNumber', segment.seq))
    if (segment.ack !== undefined) fields.push(field('ackNumber', segment.ack))
    const tcp: PduLayerView = { layer: 4, protocol: 'tcp', fields }
    const payload = segment.payload
    if (payload === null) return [tcp]
    if (payload.kind === 'data') return [{ ...tcp, fields: [...fields, field('payloadBytes', payload.bytes)] }]
    return [tcp, PduLayers.describeHttp(payload)]
  }

  private static describeDhcp(message: DhcpMessage): PduLayerView {
    const op = PduLayers.dhcpOp(message.messageType)
    const { options } = message
    const optionText = [
      options.subnetMask && `mask ${options.subnetMask}`,
      options.routers && `router ${options.routers.join(', ')}`,
      options.dnsServers && `dns ${options.dnsServers.join(', ')}`,
      options.leaseSeconds !== undefined && `lease ${options.leaseSeconds}s`,
      options.serverIdentifier && `server ${options.serverIdentifier}`,
      options.requestedIp && `requested ${options.requestedIp}`,
      options.hostName && `host ${options.hostName}`,
      options.message && `message "${options.message}"`,
    ].filter((part): part is string => typeof part === 'string' && part !== '')
    return {
      layer: 7,
      protocol: 'dhcp',
      fields: [
        field('bootpOp', op === 1 ? '1 (BOOTREQUEST)' : '2 (BOOTREPLY)'),
        field('dhcpMessageType', message.messageType.toUpperCase()),
        field('transactionId', hex(message.transactionId, 8)),
        field('clientMac', message.clientMac),
        field('clientIp', message.clientIp),
        field('yourIp', message.yourIp),
        field('serverIp', message.serverIp),
        field('relayIp', message.relayIp),
        field('broadcastFlag', message.broadcast),
        field('dhcpOptions', optionText.join('; ')),
      ],
    }
  }

  private static describeDns(message: DnsMessage): PduLayerView {
    const flags = [message.response ? 'response' : 'query', message.recursionDesired && 'RD', message.recursionAvailable && 'RA', message.authoritative && 'AA']
    const fields = [
      field('dnsId', hex(message.id, 4)),
      field('dnsFlags', flags.filter((flag): flag is string => typeof flag === 'string').join(', ')),
      field('responseCode', message.responseCode),
      ...message.questions.map((question) => field('question', `${question.name} ${question.type}`)),
      ...message.answers.map((answer) => field('answer', `${answer.name} ${answer.type} ${answer.address} (TTL ${answer.ttlSeconds})`)),
    ]
    return { layer: 7, protocol: 'dns', fields }
  }

  private static describeHttp(message: HttpMessage): PduLayerView {
    if (message.message === 'request') {
      return { layer: 7, protocol: 'http', fields: [field('httpRequestLine', `${message.method} ${message.path} HTTP/1.0`), field('httpHost', message.host)] }
    }
    return { layer: 7, protocol: 'http', fields: [field('httpStatus', message.status), field('contentLength', message.contentBytes)] }
  }
}
