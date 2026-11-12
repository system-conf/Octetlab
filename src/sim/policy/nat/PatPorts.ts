// PAT port choice (Cisco NAT FAQ, https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/26704-nat-faq-00.html):
// keep the inside port when it is free on the global address; otherwise take the first free port from
// the start of the same group (TCP / UDP 1-511, 512-1023, 1024-65535; the ICMP groups start at 0).
// When a group is full on one address, the next pool address is tried with the original port again.
import type { NatTranslation } from '../../contract/SecurityRuntime'
import type { NatProtocol } from './NatPackets'

const GROUP_ENDS = [511, 1023, 65_535] as const

function groupOf(port: number, protocol: NatProtocol): readonly [number, number] {
  const firstStart = protocol === 'icmp' ? 0 : 1
  if (port <= GROUP_ENDS[0]) return [firstStart, GROUP_ENDS[0]]
  if (port <= GROUP_ENDS[1]) return [GROUP_ENDS[0] + 1, GROUP_ENDS[1]]
  return [GROUP_ENDS[1] + 1, GROUP_ENDS[2]]
}

export class PatPorts {
  /** Ports of `protocol` already taken on `globalIp` (dynamic and static rows). */
  static used(rows: readonly NatTranslation[], protocol: NatProtocol, globalIp: string): Set<number> {
    const used = new Set<number>()
    for (const entry of rows) {
      if (entry.protocol === protocol && entry.insideGlobal.ip === globalIp && entry.insideGlobal.port !== undefined) used.add(entry.insideGlobal.port)
    }
    return used
  }

  /** The port for `insidePort` on one global address; null when its group is full there. */
  static pick(used: ReadonlySet<number>, protocol: NatProtocol, insidePort: number): number | null {
    if (!used.has(insidePort)) return insidePort
    const [start, end] = groupOf(insidePort, protocol)
    for (let port = start; port <= end; port++) if (!used.has(port)) return port
    return null
  }
}
