import { describe, expect, it } from 'vitest'
import type { NatSettings, NetworkState } from '../../../domain'
import { createSimulation } from '../../createSimulation'
import type { Ipv4Packet, Pdu, SimEvent, SimReason, SimRequest, SimulationEngine } from '../../contract'
import type { FirewallConnection } from '../../contract/FirewallRuntime'
import { firewallLab, OUT_IP, PC_IP, permitTcpTo, SRV_IP, WAN_IP } from './firewallTestLabs'

const ping = (deviceId: string, targetIp: string, count = 1): SimRequest => ({ kind: 'ping', deviceId, targetIp, count, size: 32 })
const http = (deviceId: string, serverIp: string): SimRequest => ({ kind: 'httpGet', deviceId, serverIp, host: 'example.com', path: '/' })
const WEB_IP = '142.250.187.206'

function run(engine: SimulationEngine, request: SimRequest): string {
  const id = engine.inject(request)
  engine.runUntilDone(id)
  return id
}

function start(lab: NetworkState): SimulationEngine {
  return createSimulation(lab)
}

function echoKinds(engine: SimulationEngine, id: string): string[] {
  const result = engine.request(id)?.result
  if (result?.kind !== 'ping') throw new Error('no ping result')
  return result.echoes.map((echo) => echo.kind)
}

function drops(engine: SimulationEngine): SimReason[] {
  return engine
    .events()
    .filter((event: SimEvent) => event.deviceId === 'fw' && event.action === 'dropped' && event.reason !== null)
    .map((event) => event.reason)
    .filter((reason): reason is SimReason => reason !== undefined && reason !== null)
}

function noteKeys(engine: SimulationEngine): string[] {
  return engine
    .events()
    .filter((event) => event.deviceId === 'fw')
    .flatMap((event) => event.notes.map((note) => note.message.key))
}

function table(engine: SimulationEngine): readonly FirewallConnection[] {
  return engine.runtime('fw')?.extensions?.firewallConnections ?? []
}

function ipv4Of(pdu: Pdu | null): Ipv4Packet | null {
  if (pdu === null) return null
  if (pdu.kind === 'ipv4') return pdu
  return pdu.payload.kind === 'ipv4' ? pdu.payload : null
}

function arrivals(engine: SimulationEngine, deviceId: string): Ipv4Packet[] {
  return engine
    .events()
    .filter((event) => event.deviceId === deviceId && event.inbound !== null)
    .map((event) => ipv4Of(event.inbound))
    .filter((packet): packet is Ipv4Packet => packet !== null)
}

describe('FirewallPolicy: levels and the connection table', () => {
  it('inside → outside ping: an ICMP connection is created and the reply returns through it', () => {
    const engine = start(firewallLab())
    const id = run(engine, ping('pc1', OUT_IP))
    expect(echoKinds(engine, id)).toEqual(['reply'])
    expect(table(engine)).toEqual([expect.objectContaining({ protocol: 'icmp', initiator: expect.objectContaining({ ip: PC_IP }), responder: expect.objectContaining({ ip: OUT_IP }), inInterface: 'inside', outInterface: 'outside', state: 'open' })])
    expect(noteKeys(engine)).toEqual(expect.arrayContaining(['firewall:notes.higherToLower', 'firewall:notes.connectionCreated', 'firewall:notes.connectionMatched']))
    expect(engine.runtime('fw')?.extensions?.firewallStatistics).toEqual({ created: 1, denied: 0, expired: 0 })
  })

  it('outside → inside without an ACL is dropped silently (firewallDenied)', () => {
    const engine = start(firewallLab())
    const id = run(engine, ping('out', PC_IP))
    expect(echoKinds(engine, id)).toEqual(['timeout'])
    expect(drops(engine)).toEqual(['firewallDenied'])
    expect(noteKeys(engine)).toContain('firewall:notes.lowerToHigher')
    expect(table(engine)).toEqual([])
    expect(engine.runtime('fw')?.extensions?.firewallStatistics).toMatchObject({ denied: 1 })
  })

  it('inspectIcmp false: the echo reply is new lower → higher traffic and is dropped', () => {
    const engine = start(firewallLab({ settings: { inspectIcmp: false } }))
    const id = run(engine, ping('pc1', OUT_IP))
    expect(echoKinds(engine, id)).toEqual(['timeout'])
    expect(drops(engine)).toEqual(['firewallDenied'])
    expect(table(engine)).toEqual([])
  })

  it('a ping to the firewall itself passes (steps 1 and 2 only)', () => {
    const engine = start(firewallLab())
    expect(echoKinds(engine, run(engine, ping('out', '198.51.100.1')))).toEqual(['reply'])
    expect(table(engine)).toEqual([])
  })

  it('an interface without nameif passes nothing, in or out', () => {
    const engine = start(firewallLab({ nameifs: { 'Gi0/2': null } }))
    expect(echoKinds(engine, run(engine, ping('pc1', SRV_IP)))).toEqual(['timeout'])
    expect(echoKinds(engine, run(engine, ping('srv', PC_IP)))).toEqual(['timeout'])
    expect(echoKinds(engine, run(engine, ping('srv', '172.16.1.1')))).toEqual(['timeout'])
    expect(drops(engine)).toEqual(['firewallNoNameif', 'firewallNoNameif', 'firewallNoNameif'])
    expect(noteKeys(engine)).toContain('firewall:notes.noNameif')
  })

  it('same level: blocked by default, allowed with same-security-traffic inter-interface', () => {
    const nameifs = { 'Gi0/2': { nameif: 'dmz', securityLevel: 100 } }
    const blocked = start(firewallLab({ nameifs }))
    expect(echoKinds(blocked, run(blocked, ping('pc1', SRV_IP)))).toEqual(['timeout'])
    expect(drops(blocked)).toEqual(['firewallSameLevel'])
    const allowed = start(firewallLab({ nameifs, settings: { sameSecurityInterInterface: true } }))
    expect(echoKinds(allowed, run(allowed, ping('pc1', SRV_IP)))).toEqual(['reply'])
    expect(noteKeys(allowed)).toContain('firewall:notes.sameLevelPermitted')
    // The intra-interface switch does not cover two different interfaces.
    const intraOnly = start(firewallLab({ nameifs, settings: { sameSecurityIntraInterface: true } }))
    expect(echoKinds(intraOnly, run(intraOnly, ping('pc1', SRV_IP)))).toEqual(['timeout'])
  })

  it('higher → lower between inside and dmz, and dmz → inside is denied', () => {
    const engine = start(firewallLab())
    expect(echoKinds(engine, run(engine, ping('pc1', SRV_IP)))).toEqual(['reply'])
    expect(echoKinds(engine, run(engine, ping('srv', PC_IP)))).toEqual(['timeout'])
    expect(drops(engine)).toEqual(['firewallDenied'])
  })
})

describe('FirewallPolicy: TCP', () => {
  it('handshake inside → internet: SYN creates, SYN+ACK establishes, FIN half-closes', () => {
    const engine = start(firewallLab({ outside: 'cloud' }))
    const id = run(engine, http('pc1', WEB_IP))
    expect(engine.request(id)?.result).toMatchObject({ kind: 'http', outcome: { ok: true, status: 200 } })
    const [entry] = table(engine)
    expect(table(engine)).toHaveLength(1)
    expect(entry).toMatchObject({ protocol: 'tcp', initiator: { ip: PC_IP }, responder: { ip: WEB_IP, port: 80 }, state: 'halfClosed' })
    expect((entry?.expiresAt ?? 0) - (entry?.lastUsedAt ?? 0)).toBe(600_000)
    expect(entry?.bytes).toBeGreaterThan(0)
    expect(noteKeys(engine)).toEqual(expect.arrayContaining(['firewall:notes.connectionEstablished', 'firewall:notes.connectionHalfClosed']))
    expect(drops(engine)).toEqual([])
  })

  it('a SYN from outside without an ACL is dropped', () => {
    const engine = start(firewallLab())
    const id = run(engine, http('out', PC_IP))
    expect(engine.request(id)?.result).toMatchObject({ kind: 'http', outcome: { ok: false } })
    expect(drops(engine)[0]).toBe('firewallDenied')
    expect(arrivals(engine, 'pc1').filter((packet) => packet.payload.kind === 'tcp')).toEqual([])
  })

  it('ACL exception: an inbound ACL on outside lets a SYN to the dmz server through; its RST removes the entry', () => {
    const engine = start(firewallLab({ lists: [permitTcpTo('OUTSIDE_IN', SRV_IP, 80)], accessGroups: { 'Gi0/0': { in: 'OUTSIDE_IN' } } }))
    const id = run(engine, http('out', SRV_IP))
    // srv runs no web server: the RST comes back through the connection.
    expect(engine.request(id)?.result).toMatchObject({ kind: 'http', outcome: { ok: false, reason: 'connectionRefused' } })
    expect(noteKeys(engine)).toEqual(expect.arrayContaining(['firewall:notes.aclException', 'firewall:notes.connectionCreated', 'firewall:notes.connectionReset']))
    expect(table(engine)).toEqual([])
    expect(engine.runtime('fw')?.extensions?.firewallStatistics).toMatchObject({ created: 1, denied: 0 })
  })

  it('an inbound ACL on outside never blocks the replies of inside connections; it opens the dmz web port only', () => {
    const lab = (outside: 'cloud' | 'host') => firewallLab({ outside, lists: [permitTcpTo('OUTSIDE_IN', SRV_IP, 80)], accessGroups: { 'Gi0/0': { in: 'OUTSIDE_IN' } } })
    const engine = start(lab('host'))
    expect(echoKinds(engine, run(engine, ping('pc1', OUT_IP)))).toEqual(['reply'])
    const toDmz = run(engine, http('out', SRV_IP))
    expect(engine.request(toDmz)?.result).toMatchObject({ kind: 'http', outcome: { ok: false, reason: 'connectionRefused' } })
    expect(echoKinds(engine, run(engine, ping('out', PC_IP)))).toEqual(['timeout'])
    const toInside = run(engine, http('out', PC_IP))
    expect(engine.request(toInside)?.result).toMatchObject({ kind: 'http', outcome: { ok: false } })
    expect(arrivals(engine, 'pc1').filter((packet) => packet.src === OUT_IP && packet.payload.kind !== 'icmp')).toEqual([])
    // Both outside → inside attempts end at the ACL's implicit deny, silently (no admin-prohibited back).
    expect(drops(engine)).toEqual(['aclDenied', 'aclDenied'])
    expect(arrivals(engine, 'out').some((packet) => packet.payload.kind === 'icmp' && packet.payload.type === 'destinationUnreachable')).toBe(false)
    const web = start(lab('cloud'))
    const id = run(web, http('pc1', WEB_IP))
    expect(web.request(id)?.result).toMatchObject({ kind: 'http', outcome: { ok: true, status: 200 } })
    expect(drops(web)).toEqual([])
  })
})

describe('FirewallPolicy: NAT, expiry, clear, snapshot', () => {
  const OVERLOAD: NatSettings = { pools: [], statics: [], dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/0' }, overload: true }] }
  const natLab = (): NetworkState =>
    firewallLab({
      outside: 'cloud',
      nat: OVERLOAD,
      natRoles: { 'Gi0/1': 'inside', 'Gi0/0': 'outside' },
      lists: [{ name: '1', type: 'standard', entries: [{ kind: 'standard', seq: 10, action: 'permit', source: { address: '192.168.1.0', wildcard: '0.0.0.255' } }] }],
    })

  it('PAT: the connection holds the real inside address and the translated reply finds it', () => {
    const engine = start(natLab())
    const id = run(engine, ping('pc1', '8.8.8.8'))
    expect(echoKinds(engine, id)).toEqual(['reply'])
    expect(arrivals(engine, 'internet').filter((packet) => packet.payload.kind === 'icmp').map((packet) => packet.src)).toEqual([WAN_IP])
    expect(table(engine)).toEqual([expect.objectContaining({ protocol: 'icmp', initiator: expect.objectContaining({ ip: PC_IP }), responder: expect.objectContaining({ ip: '8.8.8.8' }) })])
    const web = run(engine, http('pc1', WEB_IP))
    expect(engine.request(web)?.result).toMatchObject({ kind: 'http', outcome: { ok: true, status: 200 } })
    expect(table(engine).find((entry) => entry.protocol === 'tcp')).toMatchObject({ initiator: { ip: PC_IP }, responder: { ip: WEB_IP, port: 80 } })
    expect(drops(engine)).toEqual([])
  })

  it('expiry: an ICMP entry is gone 2 s later and counted as expired', () => {
    const engine = start(firewallLab())
    run(engine, ping('pc1', OUT_IP))
    expect(table(engine)).toHaveLength(1)
    engine.runUntil(engine.time + 2001)
    run(engine, ping('pc1', SRV_IP))
    expect(table(engine).map((entry) => entry.responder.ip)).toEqual([SRV_IP])
    expect(engine.runtime('fw')?.extensions?.firewallStatistics).toMatchObject({ created: 2, expired: 1 })
  })

  it('a configured timeout replaces the default', () => {
    const engine = start(firewallLab({ settings: { timeouts: { icmp: 30 } } }))
    run(engine, ping('pc1', OUT_IP))
    const [entry] = table(engine)
    expect((entry?.expiresAt ?? 0) - (entry?.lastUsedAt ?? 0)).toBe(30_000)
  })

  it('clear conn removes the live entries and returns how many', () => {
    const engine = start(firewallLab())
    run(engine, ping('pc1', OUT_IP))
    run(engine, ping('pc1', SRV_IP))
    const id = run(engine, { kind: 'clearTable', deviceId: 'fw', table: 'firewallConnections' })
    expect(engine.request(id)?.result).toEqual({ kind: 'cleared', entries: 2 })
    expect(table(engine)).toEqual([])
  })

  it('snapshot / restore brings the connection table back', () => {
    const engine = start(firewallLab())
    const mark = engine.snapshot()
    run(engine, ping('pc1', OUT_IP))
    const after = engine.snapshot()
    expect(table(engine)).toHaveLength(1)
    engine.restore(mark)
    expect(table(engine)).toEqual([])
    engine.restore(after)
    expect(table(engine)).toHaveLength(1)
  })
})
