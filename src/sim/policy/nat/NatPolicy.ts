// NAT policy of the packet-policy chain (pack 5.2, owner: agent B; docs/SECURITY_PACK.md §8).
// Prelude stub: lets every packet pass unchanged until agent B implements inside source translation.
import type { DeviceContext } from '../../contract'
import { type EgressPacket, type IngressPacket, PASS, type PacketPolicy, type PolicyVerdict } from '../PacketPolicy'

export class NatPolicy implements PacketPolicy {
  ingress(_ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    return PASS(arrival.packet)
  }

  egress(_ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    return PASS(departure.packet)
  }
}
