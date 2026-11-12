// The fields of a simulated IPv4 packet that an ACL looks at (AclMatcher.AclPacketView).
import type { AclPacketView } from '../../../net/AclMatcher'
import type { Ipv4Packet } from '../../contract'
import { PduLayers } from '../../contract/PduLayers'

export class AclPacketViews {
  static of(packet: Ipv4Packet): AclPacketView {
    const base = { src: packet.src, dst: packet.dst }
    const payload = packet.payload
    switch (payload.kind) {
      case 'tcp':
        return { ...base, protocol: 'tcp', srcPort: payload.srcPort, dstPort: payload.dstPort, tcpFlags: payload.flags }
      case 'udp':
        return { ...base, protocol: 'udp', srcPort: payload.srcPort, dstPort: payload.dstPort }
      case 'icmp': {
        const { type, code } = PduLayers.icmpNumbers(payload)
        return { ...base, protocol: 'icmp', icmpType: type, icmpCode: code }
      }
      default:
        return { ...base, protocol: 'other' }
    }
  }
}
