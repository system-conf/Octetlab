import { describe, expect, it } from 'vitest'
import type { AccessList, AclEntry } from '../domain'
import { AclMatcher, type AclPacketView } from './AclMatcher'

const ANY = { address: '0.0.0.0', wildcard: '255.255.255.255' }
const host = (address: string) => ({ address, wildcard: '0.0.0.0' })

function list(entries: AclEntry[], type: AccessList['type'] = 'extended'): AccessList {
  return { name: '101', type, entries }
}

const tcp = (src: string, dst: string, dstPort: number, flags: AclPacketView['tcpFlags'] = ['syn'], srcPort = 49152): AclPacketView => ({
  protocol: 'tcp',
  src,
  dst,
  srcPort,
  dstPort,
  tcpFlags: flags,
})

describe('AclMatcher', () => {
  it('matches wildcard bits: 0 must match, 1 is ignored (also non-contiguous)', () => {
    const subnet = { address: '192.168.1.0', wildcard: '0.0.0.255' }
    expect(AclMatcher.addressMatches(subnet, '192.168.1.77')).toBe(true)
    expect(AclMatcher.addressMatches(subnet, '192.168.2.77')).toBe(false)
    const odd = { address: '10.0.0.1', wildcard: '0.0.255.254' }
    expect(AclMatcher.addressMatches(odd, '10.0.9.3')).toBe(true)
    expect(AclMatcher.addressMatches(odd, '10.0.9.2')).toBe(false)
    expect(AclMatcher.addressMatches(ANY, '8.8.8.8')).toBe(true)
    expect(AclMatcher.addressMatches(host('10.0.0.5'), '10.0.0.5')).toBe(true)
    expect(AclMatcher.addressMatches(host('10.0.0.5'), '10.0.0.6')).toBe(false)
  })

  it('a missing list and an empty list permit; otherwise the implicit deny ends the list', () => {
    const packet: AclPacketView = { protocol: 'icmp', src: '10.0.0.1', dst: '10.0.0.2', icmpType: 8, icmpCode: 0 }
    expect(AclMatcher.decide(undefined, packet)).toEqual({ kind: 'noList' })
    expect(AclMatcher.decide(list([]), packet)).toEqual({ kind: 'noList' })
    expect(AclMatcher.decide(list([{ seq: 10, kind: 'remark', text: 'only a remark' }]), packet)).toEqual({ kind: 'noList' })
    const deny = AclMatcher.decide(list([{ seq: 10, kind: 'standard', action: 'permit', source: host('10.9.9.9') }], 'standard'), packet)
    expect(deny).toEqual({ kind: 'implicitDeny' })
    expect(AclMatcher.permits(deny)).toBe(false)
  })

  it('checks entries in sequence order, first match wins', () => {
    const entries: AclEntry[] = [
      { seq: 20, kind: 'standard', action: 'permit', source: ANY },
      { seq: 10, kind: 'standard', action: 'deny', source: { address: '192.168.1.0', wildcard: '0.0.0.255' } },
    ]
    const packet: AclPacketView = { protocol: 'udp', src: '192.168.1.5', dst: '1.1.1.1', srcPort: 1, dstPort: 53 }
    expect(AclMatcher.decide(list(entries, 'standard'), packet)).toEqual({ kind: 'match', action: 'deny', seq: 10 })
    expect(AclMatcher.decide(list(entries, 'standard'), { ...packet, src: '192.168.2.5' })).toEqual({ kind: 'match', action: 'permit', seq: 20 })
  })

  it('tcp / udp ports: eq, neq, gt, lt, range, and the protocol must agree', () => {
    const rule = (destinationPort: NonNullable<Extract<AclEntry, { kind: 'extended' }>['destinationPort']>): AccessList =>
      list([{ seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: ANY, destination: ANY, destinationPort }])
    const web = tcp('10.0.0.1', '10.0.0.2', 80)
    expect(AclMatcher.decide(rule({ op: 'eq', port: 80 }), web).kind).toBe('match')
    expect(AclMatcher.decide(rule({ op: 'neq', port: 80 }), web).kind).toBe('implicitDeny')
    expect(AclMatcher.decide(rule({ op: 'gt', port: 79 }), web).kind).toBe('match')
    expect(AclMatcher.decide(rule({ op: 'lt', port: 80 }), web).kind).toBe('implicitDeny')
    expect(AclMatcher.decide(rule({ op: 'range', from: 20, to: 80 }), web).kind).toBe('match')
    expect(AclMatcher.decide(rule({ op: 'eq', port: 80 }), { protocol: 'udp', src: '10.0.0.1', dst: '10.0.0.2', srcPort: 1, dstPort: 80 }).kind).toBe('implicitDeny')
    const sourcePort = list([{ seq: 10, kind: 'extended', action: 'deny', protocol: 'udp', source: ANY, sourcePort: { op: 'eq', port: 53 }, destination: ANY }])
    expect(AclMatcher.decide(sourcePort, { protocol: 'udp', src: '1.1.1.1', dst: '2.2.2.2', srcPort: 53, dstPort: 5000 })).toEqual({ kind: 'match', action: 'deny', seq: 10 })
  })

  it('ip matches every protocol; established needs ACK or RST', () => {
    const ip = list([{ seq: 10, kind: 'extended', action: 'permit', protocol: 'ip', source: host('10.0.0.1'), destination: ANY }])
    expect(AclMatcher.decide(ip, { protocol: 'other', src: '10.0.0.1', dst: '1.1.1.1' }).kind).toBe('match')
    const established = list([{ seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: ANY, destination: ANY, established: true }])
    expect(AclMatcher.decide(established, tcp('1.1.1.1', '10.0.0.1', 49152, ['syn'])).kind).toBe('implicitDeny')
    expect(AclMatcher.decide(established, tcp('1.1.1.1', '10.0.0.1', 49152, ['syn', 'ack'])).kind).toBe('match')
    expect(AclMatcher.decide(established, tcp('1.1.1.1', '10.0.0.1', 49152, ['rst'])).kind).toBe('match')
  })

  it('icmp type and code', () => {
    const echo = list([{ seq: 10, kind: 'extended', action: 'deny', protocol: 'icmp', source: ANY, destination: ANY, icmpType: 8 }])
    expect(AclMatcher.decide(echo, { protocol: 'icmp', src: '1.1.1.1', dst: '2.2.2.2', icmpType: 8, icmpCode: 0 }).kind).toBe('match')
    expect(AclMatcher.decide(echo, { protocol: 'icmp', src: '1.1.1.1', dst: '2.2.2.2', icmpType: 0, icmpCode: 0 }).kind).toBe('implicitDeny')
    const code = list([{ seq: 10, kind: 'extended', action: 'permit', protocol: 'icmp', source: ANY, destination: ANY, icmpType: 3, icmpCode: 13 }])
    expect(AclMatcher.decide(code, { protocol: 'icmp', src: '1.1.1.1', dst: '2.2.2.2', icmpType: 3, icmpCode: 1 }).kind).toBe('implicitDeny')
    expect(AclMatcher.decide(code, { protocol: 'icmp', src: '1.1.1.1', dst: '2.2.2.2', icmpType: 3, icmpCode: 13 }).kind).toBe('match')
  })
})
