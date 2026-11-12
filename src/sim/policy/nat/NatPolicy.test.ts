import { describe, expect, it } from 'vitest'
import type { NatSettings, NetworkState } from '../../../domain'
import { createSimulation } from '../../createSimulation'
import type { Ipv4Packet, Pdu, SimEvent, SimRequest, SimulationEngine } from '../../contract'
import type { NatTranslation } from '../../contract/SecurityRuntime'
import { NAT_TIMEOUTS } from './NatTimeouts'
import { natInternetLab, natOutsideHostLab, WAN_IP } from './natTestLabs'

const ping = (deviceId: string, targetIp: string, count = 1): SimRequest => ({ kind: 'ping', deviceId, targetIp, count, size: 32 })
const http = (deviceId: string, serverIp: string): SimRequest => ({ kind: 'httpGet', deviceId, serverIp, host: 'example.com', path: '/' })

const OVERLOAD_INTERFACE: NatSettings = { pools: [], statics: [], dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1' }, overload: true }] }

function poolNat(start: string, end: string, overload: boolean): NatSettings {
  return {
    pools: [{ name: 'PUB', start, end, netmask: '255.255.255.248' }],
    statics: [],
    dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'pool', poolName: 'PUB' }, overload }],
  }
}

function ipv4Of(pdu: Pdu | null): Ipv4Packet | null {
  if (pdu === null) return null
  if (pdu.kind === 'ipv4') return pdu
  return pdu.payload.kind === 'ipv4' ? pdu.payload : null
}

function start(lab: NetworkState): SimulationEngine {
  return createSimulation(lab)
}

function run(engine: SimulationEngine, request: SimRequest): string {
  const id = engine.inject(request)
  engine.runUntilDone(id)
  return id
}

function echoKinds(engine: SimulationEngine, id: string): string[] {
  const result = engine.request(id)?.result
  if (result?.kind !== 'ping') throw new Error('no ping result')
  return result.echoes.map((echo) => echo.kind)
}

/** Sources of the IPv4 packets that arrived at `deviceId`. */
function arrivals(engine: SimulationEngine, deviceId: string): Ipv4Packet[] {
  return engine
    .events()
    .filter((event: SimEvent) => event.deviceId === deviceId && event.inbound !== null)
    .map((event) => ipv4Of(event.inbound))
    .filter((packet): packet is Ipv4Packet => packet !== null)
}

function table(engine: SimulationEngine): readonly NatTranslation[] {
  return engine.runtime('router')?.extensions?.natTranslations ?? []
}

describe('NAT policy', () => {
  it('leaves devices without NAT alone: the cloud still answers the private source (decision 1)', () => {
    const engine = start(natInternetLab({ pools: [], statics: [], dynamics: [] }))
    const id = run(engine, ping('pc1', '8.8.8.8'))
    expect(echoKinds(engine, id)).toEqual(['reply'])
    expect(arrivals(engine, 'internet').map((packet) => packet.src)).toContain('192.168.1.10')
    expect(table(engine)).toEqual([])
  })

  it('interface overload: ping leaves with the WAN address and the reply finds the inside host', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    const id = run(engine, ping('pc1', '8.8.8.8', 2))
    expect(echoKinds(engine, id)).toEqual(['reply', 'reply'])
    const atCloud = arrivals(engine, 'internet').filter((packet) => packet.payload.kind === 'icmp')
    expect(atCloud.map((packet) => packet.src)).toEqual([WAN_IP, WAN_IP])
    const [entry] = table(engine)
    expect(table(engine)).toHaveLength(1)
    expect(entry).toMatchObject({ protocol: 'icmp', insideLocal: { ip: '192.168.1.10' }, insideGlobal: { ip: WAN_IP }, outsideGlobal: { ip: '8.8.8.8' }, origin: 'dynamic' })
    expect(entry?.expiresAt).toBe((entry?.lastUsedAt ?? 0) + NAT_TIMEOUTS.icmp)
    expect(engine.runtime('router')?.extensions?.natStatistics).toMatchObject({ misses: 1 })
    const notes = engine.events().flatMap((event) => event.notes.map((note) => note.message.key))
    expect(notes).toEqual(expect.arrayContaining(['nat:notes.created', 'nat:notes.translatedOut', 'nat:notes.translatedIn']))
  })

  it('interface overload for TCP: an HttpClient GET to the cloud works through PAT', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    const id = run(engine, http('pc1', '142.250.187.206'))
    const result = engine.request(id)?.result
    expect(result).toMatchObject({ kind: 'http', outcome: { ok: true, status: 200 } })
    const segments = arrivals(engine, 'internet').filter((packet) => packet.payload.kind === 'tcp')
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.every((packet) => packet.src === WAN_IP)).toBe(true)
    const tcp = table(engine).find((entry) => entry.protocol === 'tcp')
    expect(tcp).toMatchObject({ insideLocal: { ip: '192.168.1.10' }, insideGlobal: { ip: WAN_IP }, outsideGlobal: { ip: '142.250.187.206', port: 80 } })
    // FIN seen: the entry falls to the finrst timeout.
    expect((tcp?.expiresAt ?? 0) - (tcp?.lastUsedAt ?? 0)).toBe(NAT_TIMEOUTS.finRst)
  })

  it('port collisions: two hosts with the same echo identifier get different global ports, replies return to each', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    const first = run(engine, ping('pc1', '8.8.8.8'))
    const second = run(engine, ping('pc2', '8.8.8.8'))
    expect(echoKinds(engine, first)).toEqual(['reply'])
    expect(echoKinds(engine, second)).toEqual(['reply'])
    const rows = table(engine)
    const ports = rows.map((entry) => entry.insideGlobal.port)
    expect(new Set(ports).size).toBe(2)
    const pc1 = rows.find((entry) => entry.insideLocal.ip === '192.168.1.10')
    const pc2 = rows.find((entry) => entry.insideLocal.ip === '192.168.1.11')
    // Same inside identifier: pc1 keeps it, pc2 gets the first free one of the group.
    expect(pc1?.insideGlobal.port).toBe(pc1?.insideLocal.port)
    expect(pc2?.insideLocal.port).toBe(pc1?.insideLocal.port)
    expect(pc2?.insideGlobal.port).toBe(pc1?.insideLocal.port === 0 ? 1 : 0)
  })

  it('pool without overload: addresses are handed out lowest first; exhaustion drops with host unreachable', () => {
    // 203.0.113.8/29 pool .9 - .10: the network address .8 is never used.
    const engine = start(natInternetLab(poolNat('203.0.113.8', '203.0.113.10', false)))
    run(engine, ping('pc1', '8.8.8.8'))
    run(engine, ping('pc2', '8.8.8.8'))
    expect(table(engine).map((entry) => [entry.protocol, entry.insideLocal.ip, entry.insideGlobal.ip])).toEqual([
      ['any', '192.168.1.10', '203.0.113.9'],
      ['any', '192.168.1.11', '203.0.113.10'],
    ])
    const third = run(engine, ping('srv', '8.8.8.8'))
    const result = engine.request(third)?.result
    expect(result).toMatchObject({ kind: 'ping', echoes: [{ kind: 'unreachable', code: 'host', fromIp: '192.168.1.1' }] })
    expect(engine.events().find((event) => event.deviceId === 'router' && event.reason === 'natPoolExhausted')).toBeDefined()
    expect(engine.runtime('router')?.extensions?.natStatistics).toMatchObject({ misses: 3 })
  })

  it('pool overload shares one address by port', () => {
    const engine = start(natInternetLab(poolNat('203.0.113.9', '203.0.113.9', true)))
    run(engine, ping('pc1', '8.8.8.8'))
    run(engine, ping('pc2', '8.8.8.8'))
    expect(table(engine).map((entry) => entry.insideGlobal.ip)).toEqual(['203.0.113.9', '203.0.113.9'])
  })

  it('static 1:1 both ways: inside source rewritten, outside can start a connection to the global address', () => {
    const nat: NatSettings = { pools: [], statics: [{ kind: 'static', insideLocal: '192.168.1.50', insideGlobal: '203.0.113.50' }], dynamics: [] }
    const engine = start(natOutsideHostLab(nat))
    const inbound = run(engine, ping('out', '203.0.113.50'))
    expect(echoKinds(engine, inbound)).toEqual(['reply'])
    expect(arrivals(engine, 'srv').some((packet) => packet.dst === '192.168.1.50' && packet.src === '198.51.100.10')).toBe(true)
    expect(arrivals(engine, 'out').filter((packet) => packet.payload.kind === 'icmp').map((packet) => packet.src)).toEqual(['203.0.113.50'])
    const outbound = run(engine, ping('srv', '198.51.100.10'))
    expect(echoKinds(engine, outbound)).toEqual(['reply'])
    expect(arrivals(engine, 'out').filter((packet) => packet.payload.kind === 'icmp' && packet.payload.type === 'echoRequest').map((packet) => packet.src)).toEqual(['203.0.113.50'])
    expect(table(engine)).toEqual([])
  })

  it('static port forwarding: TCP to global:80 reaches the inside host, its answer leaves from the global address', () => {
    const forward = (globalPort: number): NatSettings => ({
      pools: [],
      statics: [{ kind: 'static', protocol: 'tcp', insideLocal: '192.168.1.50', insideLocalPort: 80, insideGlobal: '203.0.113.50', insideGlobalPort: globalPort }],
      dynamics: [],
    })
    const engine = start(natOutsideHostLab(forward(80)))
    const id = run(engine, http('out', '203.0.113.50'))
    // srv runs no web server: its RST comes back translated, so the client sees a refusal from the global address.
    expect(engine.request(id)?.result).toMatchObject({ kind: 'http', outcome: { ok: false, reason: 'connectionRefused' } })
    expect(arrivals(engine, 'srv').some((packet) => packet.dst === '192.168.1.50' && packet.payload.kind === 'tcp' && packet.payload.dstPort === 80)).toBe(true)
    expect(arrivals(engine, 'out').filter((packet) => packet.payload.kind === 'tcp').map((packet) => packet.src)).toEqual(['203.0.113.50'])
    // Only 8080 forwarded: port 80 on the global address has no translation → dropped at the router.
    const other = start(natOutsideHostLab(forward(8080)))
    run(other, http('out', '203.0.113.50'))
    expect(other.events().some((event) => event.deviceId === 'router' && event.reason === 'natNoTranslation')).toBe(true)
  })

  it('expiry: an ICMP entry is gone after 60 s of virtual time and counted as expired', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    run(engine, ping('pc1', '8.8.8.8'))
    expect(table(engine)).toHaveLength(1)
    engine.runUntil(engine.time + NAT_TIMEOUTS.icmp + 1)
    run(engine, ping('pc2', '8.8.8.8'))
    expect(table(engine).map((entry) => entry.insideLocal.ip)).toEqual(['192.168.1.11'])
    expect(engine.runtime('router')?.extensions?.natStatistics).toMatchObject({ expired: 1 })
  })

  it('clear ip nat translation * removes the dynamic entries', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    run(engine, ping('pc1', '8.8.8.8'))
    const id = run(engine, { kind: 'clearTable', deviceId: 'router', table: 'natTranslations' })
    expect(engine.request(id)?.result).toEqual({ kind: 'cleared', entries: 1 })
    expect(table(engine)).toEqual([])
  })

  it('snapshot / restore brings the translation table back', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE))
    const mark = engine.snapshot()
    run(engine, ping('pc1', '8.8.8.8'))
    const after = engine.snapshot()
    expect(table(engine)).toHaveLength(1)
    engine.restore(mark)
    expect(table(engine)).toEqual([])
    engine.restore(after)
    expect(table(engine)).toHaveLength(1)
  })

  it('an ACL that does not exist selects nothing: the packet leaves untranslated', () => {
    const engine = start(natInternetLab(OVERLOAD_INTERFACE, []))
    const id = run(engine, ping('pc1', '8.8.8.8'))
    expect(echoKinds(engine, id)).toEqual(['reply'])
    expect(arrivals(engine, 'internet').filter((packet) => packet.payload.kind === 'icmp').map((packet) => packet.src)).toEqual(['192.168.1.10'])
    expect(table(engine)).toEqual([])
  })
})
