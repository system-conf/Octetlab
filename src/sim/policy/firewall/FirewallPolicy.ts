// First link of the security chain (docs/FIREWALL_PACK.md §2): the stateful firewall. Prelude stub
// (pass-through); agent A implements the level / connection / ACL-exception verdicts here. A device
// without `features.firewall` and without firewall interfaces must always get `pass` with the same
// packet object (PacketPolicy contract).
import type { DeviceContext } from '../../contract'
import { PASS, type EgressPacket, type IngressPacket, type PacketPolicy, type PolicyVerdict } from '../PacketPolicy'

export class FirewallPolicy implements PacketPolicy {
  ingress(_ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    return PASS(arrival.packet)
  }

  egress(_ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    return PASS(departure.packet)
  }
}
