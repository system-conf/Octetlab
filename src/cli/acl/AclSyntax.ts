// IOS spelling of ACL entries (pack 5.2, docs/SECURITY_PACK.md §7): port and ICMP names, the text of an
// entry as `show access-lists` and running-config print it, and the numbered-list ranges.
// Port names: the keyword lists of the IOS `permit` (extended) command reference
// (https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/permit.htm);
// IOS prints a port by its name when it has one ("eq www", "eq domain"). Only the common subset is kept.
import type { AccessListType, AclAddressMatch, AclEntry, AclPortMatch, ExtendedAclRule } from '../../domain'
import { SecurityInvariants } from '../../domain/SecurityInvariants'
import { Ipv4 } from '../../net/Ipv4'

export const ANY: AclAddressMatch = { address: '0.0.0.0', wildcard: '255.255.255.255' }
export const MAX_SEQ = 2147483647
export const SEQ_STEP = 10

const TCP_PORTS: Readonly<Record<string, number>> = {
  bgp: 179,
  chargen: 19,
  daytime: 13,
  discard: 9,
  domain: 53,
  echo: 7,
  finger: 79,
  ftp: 21,
  'ftp-data': 20,
  pop3: 110,
  smtp: 25,
  telnet: 23,
  www: 80,
}

const UDP_PORTS: Readonly<Record<string, number>> = {
  bootpc: 68,
  bootps: 67,
  discard: 9,
  domain: 53,
  echo: 7,
  isakmp: 500,
  ntp: 123,
  rip: 520,
  snmp: 161,
  snmptrap: 162,
  syslog: 514,
  tftp: 69,
}

/** ICMP message names of the IOS extended `permit icmp` form: type and optional code. */
export const ICMP_NAMES: Readonly<Record<string, { readonly type: number; readonly code?: number; readonly help: string }>> = {
  'administratively-prohibited': { type: 3, code: 13, help: 'Administratively prohibited' },
  echo: { type: 8, help: 'Echo (ping)' },
  'echo-reply': { type: 0, help: 'Echo reply' },
  'host-unreachable': { type: 3, code: 1, help: 'Host unreachable' },
  'net-unreachable': { type: 3, code: 0, help: 'Net unreachable' },
  'port-unreachable': { type: 3, code: 3, help: 'Port unreachable' },
  'protocol-unreachable': { type: 3, code: 2, help: 'Protocol unreachable' },
  'time-exceeded': { type: 11, help: 'All time exceededs' },
  'ttl-exceeded': { type: 11, code: 0, help: 'TTL exceeded' },
  unreachable: { type: 3, help: 'All unreachables' },
}

export type TransportProtocol = 'tcp' | 'udp'

export class AclSyntax {
  static portNames(protocol: TransportProtocol): Readonly<Record<string, number>> {
    return protocol === 'tcp' ? TCP_PORTS : UDP_PORTS
  }

  /** '80' or 'www' → 80; null when neither a number in 0..65535 nor a known name. */
  static parsePort(protocol: TransportProtocol, text: string): number | null {
    if (/^\d+$/.test(text)) {
      const value = Number(text)
      return value <= 65535 ? value : null
    }
    return AclSyntax.portNames(protocol)[text.toLowerCase()] ?? null
  }

  static portText(protocol: TransportProtocol, port: number): string {
    const name = Object.entries(AclSyntax.portNames(protocol)).find(([, value]) => value === port)?.[0]
    return name ?? String(port)
  }

  /** 'host 10.0.0.1', 'any', '10.0.0.0 0.0.0.255' (extended / named style). */
  static addressText(match: AclAddressMatch): string {
    if (match.wildcard === ANY.wildcard) return 'any'
    if (match.wildcard === '0.0.0.0') return `host ${match.address}`
    return `${match.address} ${match.wildcard}`
  }

  /** Standard entries in running-config: IOS drops `host` (`access-list 10 permit 10.0.0.1`). */
  static standardSourceText(match: AclAddressMatch): string {
    if (match.wildcard === ANY.wildcard) return 'any'
    if (match.wildcard === '0.0.0.0') return match.address
    return `${match.address} ${match.wildcard}`
  }

  static portMatchText(protocol: TransportProtocol, match: AclPortMatch): string {
    if (match.op === 'range') return `range ${AclSyntax.portText(protocol, match.from)} ${AclSyntax.portText(protocol, match.to)}`
    return `${match.op} ${AclSyntax.portText(protocol, match.port)}`
  }

  static icmpText(rule: ExtendedAclRule): string {
    if (rule.icmpType === undefined) return ''
    const named = Object.entries(ICMP_NAMES).find(([, value]) => value.type === rule.icmpType && value.code === rule.icmpCode)?.[0]
    if (named !== undefined) return ` ${named}`
    return rule.icmpCode === undefined ? ` ${rule.icmpType}` : ` ${rule.icmpType} ${rule.icmpCode}`
  }

  /** The entry after its sequence number, as running-config writes it: 'permit tcp any host 10.0.0.1 eq www'. */
  static entryText(entry: AclEntry): string {
    switch (entry.kind) {
      case 'remark':
        return `remark ${entry.text}`
      case 'standard':
        return `${entry.action} ${AclSyntax.standardSourceText(entry.source)}${entry.log === true ? ' log' : ''}`
      case 'extended':
        return AclSyntax.extendedText(entry)
    }
  }

  /**
   * The entry as `show access-lists` prints it. Standard ranges read "10.0.0.0, wildcard bits 0.0.0.255"
   * (networklessons.com "Wildcard Bits explained" sample output; not in a Cisco page we could open, UNVERIFIED).
   */
  static showText(entry: AclEntry): string {
    if (entry.kind !== 'standard') return AclSyntax.entryText(entry)
    const { address, wildcard } = entry.source
    const source = wildcard === ANY.wildcard || wildcard === '0.0.0.0' ? AclSyntax.standardSourceText(entry.source) : `${address}, wildcard bits ${wildcard}`
    return `${entry.action} ${source}${entry.log === true ? ' log' : ''}`
  }

  /** `address wildcard` with the ignored bits cleared, as IOS stores it ("10.1.1.7 0.0.0.255" → 10.1.1.0). */
  static masked(address: string, wildcard: string): AclAddressMatch {
    const value = Ipv4.parse(address) ?? 0
    const bits = Ipv4.parse(wildcard) ?? 0
    return { address: Ipv4.format((value & ~bits) >>> 0), wildcard }
  }

  static isNumbered(name: string): boolean {
    return SecurityInvariants.isNumbered(name)
  }

  /** The type of a numbered list name; null for names and numbers outside every range. */
  static numberedType(name: string): AccessListType | null {
    if (!AclSyntax.isNumbered(name)) return null
    if (SecurityInvariants.numberFits(name, 'standard')) return 'standard'
    if (SecurityInvariants.numberFits(name, 'extended')) return 'extended'
    return null
  }

  private static extendedText(rule: ExtendedAclRule): string {
    const transport = rule.protocol === 'tcp' || rule.protocol === 'udp' ? rule.protocol : null
    const parts = [rule.action, rule.protocol, AclSyntax.addressText(rule.source)]
    if (transport !== null && rule.sourcePort !== undefined) parts.push(AclSyntax.portMatchText(transport, rule.sourcePort))
    parts.push(AclSyntax.addressText(rule.destination))
    if (transport !== null && rule.destinationPort !== undefined) parts.push(AclSyntax.portMatchText(transport, rule.destinationPort))
    if (rule.protocol === 'tcp' && rule.established === true) parts.push('established')
    const icmp = rule.protocol === 'icmp' ? AclSyntax.icmpText(rule) : ''
    return `${parts.join(' ')}${icmp}${rule.log === true ? ' log' : ''}`
  }
}
