import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { AccessList, AclBinding, AclEntry, Device, NetworkState } from '../../../domain'
import type { DeviceContext, EchoResult, EventBuilder, Ipv4Packet, SimRequest } from '../../contract'
import type { SimulationKernel } from '../../core'
import { l3Engine } from '../../l3/l3TestLayers'
import { ping, twoRouterLab } from '../../l3/l3TestLabs'
import { AclPolicy } from './AclPolicy'

const ANY = { address: '0.0.0.0', wildcard: '255.255.255.255' }
const host = (address: string) => ({ address, wildcard: '0.0.0.0' })
const denyEcho: AclEntry = { seq: 10, kind: 'extended', action: 'deny', protocol: 'icmp', source: ANY, destination: ANY, icmpType: 8 }
const permitAll: AclEntry = { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY }

/** r1 of twoRouterLab with `lists` and `bindings` per port id. */
function withAcl(lists: AccessList[], bindings: Record<string, AclBinding>, state: NetworkState = twoRouterLab()): NetworkState {
  const configure = (device: Device): Device => ({
    ...device,
    features: { ...device.features, accessLists: { lists } },
    ports: device.ports.map((port) => {
      const binding = bindings[port.id]
      return port.role === 'routed' && binding !== undefined ? { ...port, l3: { ...port.l3, features: { accessGroups: binding } } } : port
    }),
  })
  return { ...state, devices: state.devices.map((device) => (device.id === 'r1' ? configure(device) : device)) }
}

function run(state: NetworkState, request: SimRequest): { engine: SimulationKernel; echoes: readonly EchoResult[] } {
  const { engine } = l3Engine(state)
  const id = engine.inject(request)
  engine.runUntilDone(id)
  const result = engine.request(id)?.result
  if (result?.kind !== 'ping') throw new Error('no ping result')
  return { engine, echoes: result.echoes }
}

function aclDrops(engine: SimulationKernel): string[] {
  return engine.events().filter((event) => event.action === 'dropped' && event.reason === 'aclDenied').map((event) => event.deviceId)
}

describe('AclPolicy: ip access-group in the packet pipeline', () => {
  it('inbound deny on a forwarded packet: dropped at r1, ICMP admin-prohibited from the ingress interface', () => {
    const { engine, echoes } = run(withAcl([{ name: '101', type: 'extended', entries: [denyEcho, permitAll] }], { 'Gi0/0': { in: '101' } }), ping('pc1', '10.0.2.10'))
    expect(echoes).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.1.1', code: 'adminProhibited' })])
    expect(aclDrops(engine)).toEqual(['r1'])
    expect(engine.runtime('r1')?.extensions?.aclCounters).toEqual({ '101': { 10: 1 } })
    const drop = engine.events().find((event) => event.reason === 'aclDenied')
    expect(drop?.notes.map((note) => note.message.key)).toContain('acl:notes.denied')
  })

  it('inbound filters packets for the router itself too (local delivery)', () => {
    const { echoes } = run(withAcl([{ name: '101', type: 'extended', entries: [denyEcho, permitAll] }], { 'Gi0/0': { in: '101' } }), ping('pc1', '10.0.1.1'))
    expect(echoes).toEqual([expect.objectContaining({ kind: 'unreachable', code: 'adminProhibited' })])
  })

  it('outbound filters forwarded packets on the exit interface; the reply comes back through the other direction', () => {
    const lists: AccessList[] = [{ name: 'OUT', type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'deny', source: host('10.0.1.10') }] }]
    const denied = run(withAcl(lists, { 'Gi0/1': { out: 'OUT' } }), ping('pc1', '10.0.2.10'))
    expect(denied.echoes).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.1.1', code: 'adminProhibited' })])
    // The same list inbound on Gi0/1 does not see pc1's request (it leaves through Gi0/1) nor pc2's reply (source 10.0.2.10 → implicit deny).
    const inbound = run(withAcl(lists, { 'Gi0/1': { in: 'OUT' } }), ping('pc1', '10.0.2.10'))
    expect(inbound.echoes).toEqual([expect.objectContaining({ kind: 'timeout' })])
    expect(aclDrops(inbound.engine)).toEqual(['r1'])
  })

  it('packets the router originates skip the outbound list', () => {
    const lists: AccessList[] = [{ name: 'NONE', type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'deny', source: ANY }] }]
    const { echoes, engine } = run(withAcl(lists, { 'Gi0/1': { out: 'NONE' } }), ping('r1', '10.0.2.10'))
    expect(echoes).toEqual([expect.objectContaining({ kind: 'reply' })])
    expect(aclDrops(engine)).toEqual([])
  })

  it('a missing list and an empty list permit everything', () => {
    expect(run(withAcl([], { 'Gi0/0': { in: 'NOPE' } }), ping('pc1', '10.0.2.10')).echoes).toEqual([expect.objectContaining({ kind: 'reply' })])
    const empty = run(withAcl([{ name: 'E', type: 'standard', entries: [] }], { 'Gi0/0': { in: 'E' } }), ping('pc1', '10.0.2.10'))
    expect(empty.echoes).toEqual([expect.objectContaining({ kind: 'reply' })])
    expect(empty.engine.runtime('r1')?.extensions?.aclCounters).toBeUndefined()
  })

  it('a device without bindings passes the very same packet object (no notes, no counters)', () => {
    const { engine, echoes } = run(twoRouterLab(), ping('pc1', '10.0.2.10'))
    expect(echoes).toEqual([expect.objectContaining({ kind: 'reply' })])
    expect(engine.events().some((event) => event.notes.some((note) => note.message.key.startsWith('acl:')))).toBe(false)
  })

  it('counters add up: every ACL decision with a match counts once (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.boolean(), (count, permitFirst) => {
        const first: AclEntry = { seq: 10, kind: 'standard', action: permitFirst ? 'permit' : 'deny', source: host('10.0.1.10') }
        const lists: AccessList[] = [{ name: '1', type: 'standard', entries: [first, { seq: 20, kind: 'standard', action: 'permit', source: ANY }] }]
        const { engine, echoes } = run(withAcl(lists, { 'Gi0/0': { in: '1' }, 'Gi0/1': { in: '1' } }), ping('pc1', '10.0.2.10', count))
        const counters = engine.runtime('r1')?.extensions?.aclCounters?.['1'] ?? {}
        const total = Object.values(counters).reduce((sum, value) => sum + value, 0)
        const decisions = engine.events().filter((event) => event.deviceId === 'r1' && event.notes.some((note) => note.message.key.startsWith('acl:notes.'))).length
        expect(total).toBe(decisions)
        // Requests from pc1 match entry 10; replies from pc2 entering Gi0/1 match entry 20.
        if (permitFirst) expect(counters).toEqual({ 10: count, 20: count })
        else expect(counters).toEqual({ 10: count })
        expect(echoes).toHaveLength(count)
      }),
      { numRuns: 12 },
    )
  })

  it('steps aside on a firewall (FirewallPolicy evaluates its ACLs); a router with the same binding still denies', () => {
    const state = withAcl([{ name: '101', type: 'extended', entries: [denyEcho, permitAll] }], { 'Gi0/0': { in: '101' }, 'Gi0/1': { out: '101' } })
    const r1 = state.devices.find((device) => device.id === 'r1')
    if (r1 === undefined) throw new Error('no r1')
    const packet: Ipv4Packet = { kind: 'ipv4', src: '10.0.1.10', dst: '10.0.2.10', ttl: 64, identification: 1, payload: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1, dataBytes: 32 } }
    const event = { note: () => undefined } as unknown as EventBuilder
    const contextOf = (device: Device) => ({ device, runtime: {}, updateRuntime: () => undefined }) as unknown as DeviceContext
    const policy = new AclPolicy()
    const firewall = contextOf({ ...r1, kind: 'firewall' })
    const passedIn = policy.ingress(firewall, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event })
    const passedOut = policy.egress(firewall, { ingressInterfaceId: 'Gi0/0', exitInterfaceId: 'Gi0/1', packet, event })
    expect(passedIn.kind === 'pass' && passedIn.packet === packet).toBe(true)
    expect(passedOut.kind === 'pass' && passedOut.packet === packet).toBe(true)
    const router = contextOf(r1)
    expect(policy.ingress(router, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event })).toEqual({ kind: 'drop', reason: 'aclDenied', icmp: 'adminProhibited' })
    expect(policy.egress(router, { ingressInterfaceId: 'Gi0/0', exitInterfaceId: 'Gi0/1', packet, event })).toEqual({ kind: 'drop', reason: 'aclDenied', icmp: 'adminProhibited' })
  })
})
