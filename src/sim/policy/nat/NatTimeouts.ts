// Idle timeouts of dynamic NAT translations (IOS defaults of `ip nat translation …`, in ms).
// Sources: Cisco community "How to configure a NAT translation timeout"
// (https://community.cisco.com/t5/networking-documents/how-to-configure-a-nat-translation-timeout/ta-p/3109488)
// and O'Reilly "Cisco IOS in a Nutshell", `ip nat translation`: timeout 86400 s, udp-timeout 300 s,
// tcp-timeout 86400 s, icmp-timeout 60 s, finrst-timeout 60 s.
import type { NatTranslation } from '../../contract/SecurityRuntime'

const SECOND = 1000

export const NAT_TIMEOUTS = {
  /** Simple (address-only) dynamic entries: `ip nat translation timeout`. */
  simple: 86_400 * SECOND,
  tcp: 86_400 * SECOND,
  udp: 300 * SECOND,
  icmp: 60 * SECOND,
  /** A TCP flow after a FIN or RST went through. */
  finRst: 60 * SECOND,
} as const

export class NatTimeouts {
  static of(protocol: NatTranslation['protocol']): number {
    return protocol === 'any' ? NAT_TIMEOUTS.simple : NAT_TIMEOUTS[protocol]
  }
}
