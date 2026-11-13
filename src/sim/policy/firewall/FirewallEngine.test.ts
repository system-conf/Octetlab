import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { AccessList } from '../../../domain'
import { makeDevice, routedPort } from '../../../domain/testDevices'
import type { Ipv4Packet } from '../../contract'
import type { FirewallConnection } from '../../contract/FirewallRuntime'
import { SecurityPolicies } from '../SecurityPolicies'
import { ConnectionTable } from './ConnectionTable'
import { FirewallConfig } from './FirewallConfig'
import { FirewallFlows, type FirewallFlow } from './FirewallFlows'
import { FirewallPolicy } from './FirewallPolicy'
import { FirewallRules } from './FirewallRules'
import { FirewallRuntime } from './FirewallRuntime'
import { policyHarness, tcpPacket, udpPacket } from './firewallTestContext'
import { labFirewall, OUT_IP, PC_IP, permitTcpTo, SRV_IP } from './firewallTestLabs'

const TIMEOUTS = FirewallConfig.timeoutsOf({})
const DENY_ALL: AccessList = { name: 'NONE', type: 'standard', entries: [{ kind: 'standard', seq: 10, action: 'deny', source: { address: '0.0.0.0', wildcard: '255.255.255.255' } }] }

function flowOf(packet: Ipv4Packet): FirewallFlow {
  const flow = FirewallFlows.of(packet)
  if (flow === null) throw new Error('no flow')
  return flow
}

const egress = (packet: Ipv4Packet, ingressInterfaceId: string, exitInterfaceId: string) => ({ ingressInterfaceId, exitInterfaceId, packet })

describe('ConnectionTable: TCP state machine, UDP, ICMP', () => {
  const origin = { id: 1, inInterface: 'inside', outInterface: 'outside', now: 0, bytes: 40 }
  const syn = flowOf(tcpPacket(PC_IP, 40000, OUT_IP, 80, ['syn']))
  const synAck = flowOf(tcpPacket(OUT_IP, 80, PC_IP, 40000, ['syn', 'ack']))

  it('SYN → synSent, SYN+ACK back → established, FIN → halfClosed, RST → removed', () => {
    const created = ConnectionTable.create(syn, origin, TIMEOUTS)
    expect(created).toMatchObject({ state: 'synSent', expiresAt: 3_600_000, bytes: 40 })
    const back = ConnectionTable.find([created], synAck, true)
    expect(back?.direction).toBe('reverse')
    const established = back && ConnectionTable.advance(back, synAck, 1000, 40, TIMEOUTS)
    expect(established).toMatchObject({ state: 'established', lastUsedAt: 1000, expiresAt: 3_601_000, bytes: 80 })
    if (!established) throw new Error('missing')
    const fin = flowOf(tcpPacket(PC_IP, 40000, OUT_IP, 80, ['fin', 'ack']))
    const closing = ConnectionTable.advance({ connection: established, direction: 'forward' }, fin, 2000, 40, TIMEOUTS)
    expect(closing).toMatchObject({ state: 'halfClosed', expiresAt: 602_000 })
    const rst = flowOf(tcpPacket(OUT_IP, 80, PC_IP, 40000, ['rst']))
    expect(ConnectionTable.advance({ connection: established, direction: 'reverse' }, rst, 2000, 40, TIMEOUTS)).toBeNull()
    expect(ConnectionTable.replace([established], 1, null)).toEqual([])
  })

  it('UDP opens in state open with the UDP timeout; the answer matches in reverse', () => {
    const query = flowOf(udpPacket(PC_IP, 5000, OUT_IP, 53))
    const created = ConnectionTable.create(query, origin, TIMEOUTS)
    expect(created).toMatchObject({ protocol: 'udp', state: 'open', expiresAt: 120_000 })
    expect(ConnectionTable.find([created], flowOf(udpPacket(OUT_IP, 53, PC_IP, 5000)), true)?.direction).toBe('reverse')
    expect(ConnectionTable.find([created], flowOf(udpPacket(OUT_IP, 53, PC_IP, 5001)), true)).toBeUndefined()
  })

  it('ICMP: a reply matches the request entry backwards only; with inspection off nothing matches', () => {
    const request: FirewallFlow = { protocol: 'icmp', src: { ip: PC_IP, port: 7 }, dst: { ip: OUT_IP, port: 7 }, tcpFlags: [], echo: 'request' }
    const reply: FirewallFlow = { ...request, src: request.dst, dst: request.src, echo: 'reply' }
    const created = ConnectionTable.create(request, origin, TIMEOUTS)
    expect(created.expiresAt).toBe(2000)
    expect(ConnectionTable.find([created], reply, true)?.direction).toBe('reverse')
    expect(ConnectionTable.find([created], { ...reply, echo: 'request' }, true)).toBeUndefined()
    expect(ConnectionTable.find([created], reply, false)).toBeUndefined()
  })

  it('a configured timeout of 0 never idles out', () => {
    const created = ConnectionTable.create(syn, origin, FirewallConfig.timeoutsOf({ timeouts: { tcp: 0 } }))
    expect(created.expiresAt).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('no entry is kept past its expiresAt after a read (property)', () => {
    const entry = (id: number, expiresAt: number): FirewallConnection => ({
      id,
      protocol: 'udp',
      initiator: { ip: PC_IP, port: id },
      responder: { ip: OUT_IP, port: 53 },
      inInterface: 'inside',
      outInterface: 'outside',
      state: 'open',
      createdAt: 0,
      lastUsedAt: 0,
      expiresAt,
      bytes: 0,
    })
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 20 }), fc.integer({ min: 0, max: 10_000 }), (expiries, now) => {
        const harness = policyHarness(labFirewall({}))
        harness.ctx.updateRuntime((runtime) => ({ ...runtime, extensions: { firewallConnections: expiries.map((expiresAt, index) => entry(index, expiresAt)) } }))
        harness.setNow(now)
        const state = FirewallRuntime.read(harness.ctx)
        expect(state.connections.every((connection) => connection.expiresAt > now)).toBe(true)
        expect(FirewallRuntime.stored(harness.runtime())).toEqual(state.connections)
        expect(state.statistics.expired + state.connections.length).toBe(expiries.length)
      }),
      { numRuns: 60 },
    )
  })
})

describe('FirewallPolicy packet by packet', () => {
  it('a device that is not a firewall gets the very same packet object, without notes or runtime', () => {
    const router = makeDevice('r1', 'router', [routedPort('Gi0/0'), routedPort('Gi0/1')])
    const harness = policyHarness(router)
    const packet = tcpPacket(PC_IP, 1, OUT_IP, 80, ['ack'])
    const policy = new FirewallPolicy()
    expect(policy.ingress(harness.ctx, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event: harness.event })).toEqual({ kind: 'pass', packet })
    const verdict = policy.egress(harness.ctx, { ...egress(packet, 'Gi0/0', 'Gi0/1'), event: harness.event })
    expect(verdict.kind === 'pass' && verdict.packet === packet).toBe(true)
    expect(harness.notes).toEqual([])
    expect(harness.runtime()).toEqual({ extensions: {} })
  })

  it('mid-stream TCP without a connection is dropped (firewallNoConnection), a SYN is not', () => {
    const harness = policyHarness(labFirewall({}))
    const policy = new FirewallPolicy()
    const ack = policy.egress(harness.ctx, { ...egress(tcpPacket(PC_IP, 40000, OUT_IP, 80, ['ack']), 'Gi0/1', 'Gi0/0'), event: harness.event })
    expect(ack).toEqual({ kind: 'drop', reason: 'firewallNoConnection' })
    expect(harness.notes).toContain('firewall:notes.noConnection')
    const syn = policy.egress(harness.ctx, { ...egress(tcpPacket(PC_IP, 40000, OUT_IP, 80, ['syn']), 'Gi0/1', 'Gi0/0'), event: harness.event })
    expect(syn.kind).toBe('pass')
    expect(FirewallRuntime.stored(harness.runtime())).toHaveLength(1)
  })

  it('an ICMP error that quotes a tracked connection passes from outside; an unrelated one is denied', () => {
    const harness = policyHarness(labFirewall({}))
    const policy = new FirewallPolicy()
    policy.egress(harness.ctx, { ...egress(udpPacket(PC_IP, 5000, OUT_IP, 53), 'Gi0/1', 'Gi0/0'), event: harness.event })
    const error = (srcPort: number): Ipv4Packet => ({
      kind: 'ipv4',
      src: OUT_IP,
      dst: PC_IP,
      ttl: 64,
      identification: 2,
      payload: { kind: 'icmp', type: 'destinationUnreachable', code: 'port', original: { src: PC_IP, dst: OUT_IP, ttl: 63, identification: 1, transport: { kind: 'udp', srcPort, dstPort: 53 } } },
    })
    expect(policy.egress(harness.ctx, { ...egress(error(5000), 'Gi0/0', 'Gi0/1'), event: harness.event }).kind).toBe('pass')
    expect(harness.notes).toContain('firewall:notes.errorMatched')
    expect(policy.egress(harness.ctx, { ...egress(error(5001), 'Gi0/0', 'Gi0/1'), event: harness.event })).toEqual({ kind: 'drop', reason: 'firewallDenied' })
  })

  it('a same-level hairpin needs the intra-interface switch', () => {
    const packet = udpPacket(PC_IP, 5000, '192.168.1.20', 53)
    const blocked = policyHarness(labFirewall({}))
    expect(new FirewallPolicy().egress(blocked.ctx, { ...egress(packet, 'Gi0/1', 'Gi0/1'), event: blocked.event })).toEqual({ kind: 'drop', reason: 'firewallSameLevel' })
    const allowed = policyHarness(labFirewall({ settings: { sameSecurityIntraInterface: true } }))
    expect(new FirewallPolicy().egress(allowed.ctx, { ...egress(packet, 'Gi0/1', 'Gi0/1'), event: allowed.event }).kind).toBe('pass')
  })
})

describe('Security chain order with the firewall', () => {
  it('ingress: the firewall decides first (no nameif beats an inbound ACL)', () => {
    const device = labFirewall({ nameifs: { 'Gi0/2': null }, lists: [DENY_ALL], accessGroups: { 'Gi0/2': { in: 'NONE' } } })
    const harness = policyHarness(device)
    const verdict = SecurityPolicies.create().ingress(harness.ctx, { interfaceId: 'Gi0/2', packet: udpPacket(SRV_IP, 1, PC_IP, 2), linkBroadcast: false, event: harness.event })
    expect(verdict).toEqual({ kind: 'drop', reason: 'firewallNoNameif' })
    expect(harness.runtime().extensions?.aclCounters).toBeUndefined()
  })

  it('egress: the firewall evaluates the outbound ACL itself (AclPolicy steps aside): silent drop, counted once, no connection', () => {
    const harness = policyHarness(labFirewall({ lists: [DENY_ALL], accessGroups: { 'Gi0/0': { out: 'NONE' } } }))
    const verdict = SecurityPolicies.create().egress(harness.ctx, { ...egress(udpPacket(PC_IP, 5000, OUT_IP, 53), 'Gi0/1', 'Gi0/0'), event: harness.event })
    expect(verdict).toEqual({ kind: 'drop', reason: 'aclDenied' })
    expect(harness.runtime().extensions?.aclCounters).toEqual({ NONE: { 10: 1 } })
    expect(harness.notes.filter((key) => key.startsWith('acl:'))).toEqual(['acl:notes.denied'])
    expect(FirewallRuntime.stored(harness.runtime())).toEqual([])
  })

  it('ingress: AclPolicy passes the same packet object on a firewall even with an inbound ACL bound', () => {
    const harness = policyHarness(labFirewall({ lists: [DENY_ALL], accessGroups: { 'Gi0/0': { in: 'NONE' } } }))
    const packet = udpPacket(OUT_IP, 53, PC_IP, 5000)
    const verdict = SecurityPolicies.create().ingress(harness.ctx, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event: harness.event })
    expect(verdict.kind === 'pass' && verdict.packet === packet).toBe(true)
    expect(harness.runtime().extensions?.aclCounters).toBeUndefined()
  })

  it('the inbound ACL matches the real inside address after un-NAT (D6), and a tracked reply skips it', () => {
    const lists: AccessList[] = [permitTcpTo('IN', SRV_IP, 80)]
    const harness = policyHarness(labFirewall({ lists, accessGroups: { 'Gi0/0': { in: 'IN' } } }))
    const chain = SecurityPolicies.create()
    const out = (packet: Ipv4Packet, from: string, to: string) => chain.egress(harness.ctx, { ...egress(packet, from, to), event: harness.event })
    expect(out(tcpPacket(OUT_IP, 40000, SRV_IP, 80, ['syn']), 'Gi0/0', 'Gi0/2').kind).toBe('pass')
    expect(out(tcpPacket(OUT_IP, 40000, SRV_IP, 22, ['syn']), 'Gi0/0', 'Gi0/2')).toEqual({ kind: 'drop', reason: 'aclDenied' })
    expect(out(tcpPacket(PC_IP, 41000, OUT_IP, 443, ['syn']), 'Gi0/1', 'Gi0/0').kind).toBe('pass')
    // The SYN+ACK from outside matches the inside connection before the outside ACL (implicit deny) is read.
    expect(out(tcpPacket(OUT_IP, 443, PC_IP, 41000, ['syn', 'ack']), 'Gi0/0', 'Gi0/1').kind).toBe('pass')
    expect(harness.runtime().extensions?.aclCounters).toEqual({ IN: { 10: 1 } })
  })
})

describe('FirewallRules.decide (packet-tracer)', () => {
  const tcpTo = (dst: string) => ({ protocol: 'tcp' as const, src: OUT_IP, dst, srcPort: 40000, dstPort: 80 })

  it('lower → higher: denied without an ACL, allowed by a permitting inbound ACL, aclDenied by a non-matching one', () => {
    expect(FirewallRules.decide(labFirewall({}), 'Gi0/0', tcpTo(SRV_IP), 'Gi0/2')).toMatchObject({ kind: 'drop', reason: 'firewallDenied', acls: [] })
    const withAcl = labFirewall({ lists: [permitTcpTo('IN', SRV_IP, 80)], accessGroups: { 'Gi0/0': { in: 'IN' } } })
    expect(FirewallRules.decide(withAcl, 'Gi0/0', tcpTo(SRV_IP), 'Gi0/2')).toMatchObject({ kind: 'allow', rule: 'aclException', acls: [{ acl: 'IN', direction: 'in', permitted: true }] })
    expect(FirewallRules.decide(withAcl, 'Gi0/0', tcpTo(PC_IP), 'Gi0/1')).toMatchObject({ kind: 'drop', reason: 'aclDenied' })
  })

  it('higher → lower, to the device, nameif missing, mid-stream TCP', () => {
    const device = labFirewall({ nameifs: { 'Gi0/2': null } })
    expect(FirewallRules.decide(device, 'Gi0/1', { protocol: 'icmp', src: PC_IP, dst: OUT_IP, icmpType: 8, icmpCode: 0 }, 'Gi0/0')).toMatchObject({ kind: 'allow', rule: 'higherToLower' })
    expect(FirewallRules.decide(device, 'Gi0/0', tcpTo('198.51.100.1'), null)).toMatchObject({ kind: 'allow', rule: 'toDevice' })
    expect(FirewallRules.decide(device, 'Gi0/1', tcpTo(SRV_IP), 'Gi0/2')).toMatchObject({ kind: 'drop', reason: 'firewallNoNameif' })
    expect(FirewallRules.decide(device, 'Gi0/2', tcpTo(PC_IP), 'Gi0/1')).toMatchObject({ kind: 'drop', reason: 'firewallNoNameif' })
    expect(FirewallRules.decide(device, 'Gi0/1', { ...tcpTo(OUT_IP), tcpFlags: ['ack'] }, 'Gi0/0')).toMatchObject({ kind: 'drop', reason: 'firewallNoConnection' })
  })

  it('D8: inside defaults to 100, other names to 0', () => {
    expect(FirewallConfig.levelOf('inside', undefined)).toBe(100)
    expect(FirewallConfig.levelOf('outside', undefined)).toBe(0)
    expect(FirewallConfig.levelOf('inside', 20)).toBe(20)
  })
})
