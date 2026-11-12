// ACL policy of the packet-policy chain (pack 5.2, owner: agent A; docs/SECURITY_PACK.md §7).
// Prelude stub: lets every packet pass unchanged until agent A implements `ip access-group in|out`.
import type { DeviceContext } from '../../contract'
import { type EgressPacket, type IngressPacket, PASS, type PacketPolicy, type PolicyVerdict } from '../PacketPolicy'

export class AclPolicy implements PacketPolicy {
  ingress(_ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    return PASS(arrival.packet)
  }

  egress(_ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    return PASS(departure.packet)
  }
}
