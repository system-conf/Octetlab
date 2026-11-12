import { describe, expect, it } from 'vitest'
import type { DeviceContext, EventBuilder, Ipv4Packet } from '../contract'
import type { EgressPacket, IngressPacket, PacketPolicy, PolicyVerdict } from './PacketPolicy'
import { PacketPolicyChain } from './PacketPolicyChain'
import { SecurityPolicies } from './SecurityPolicies'

const packet: Ipv4Packet = {
  kind: 'ipv4',
  src: '10.0.0.1',
  dst: '10.0.1.1',
  ttl: 64,
  identification: 1,
  payload: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1, dataBytes: 32 },
} as Ipv4Packet
const ctx = {} as DeviceContext
const event = {} as EventBuilder

/** Records the order it was called in and rewrites the TTL to prove packets flow on. */
class Recorder implements PacketPolicy {
  private readonly name: string
  private readonly log: string[]
  private readonly dropOn: 'ingress' | 'egress' | undefined

  constructor(name: string, log: string[], dropOn?: 'ingress' | 'egress') {
    this.name = name
    this.log = log
    this.dropOn = dropOn
  }

  ingress(_ctx: DeviceContext, arrival: IngressPacket): PolicyVerdict {
    return this.step('in', arrival.packet, this.dropOn === 'ingress')
  }

  egress(_ctx: DeviceContext, departure: EgressPacket): PolicyVerdict {
    return this.step('out', departure.packet, this.dropOn === 'egress')
  }

  private step(direction: string, current: Ipv4Packet, drop: boolean): PolicyVerdict {
    this.log.push(`${this.name}-${direction}:${current.ttl}`)
    if (drop) return { kind: 'drop', reason: 'aclDenied', icmp: 'adminProhibited' }
    return { kind: 'pass', packet: { ...current, ttl: current.ttl - 1 } }
  }
}

describe('PacketPolicyChain', () => {
  it('runs ingress front to back and egress back to front, handing the rewritten packet on', () => {
    const log: string[] = []
    const chain = new PacketPolicyChain([new Recorder('acl', log), new Recorder('nat', log)])
    const inbound = chain.ingress(ctx, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event })
    const outbound = chain.egress(ctx, { ingressInterfaceId: 'Gi0/0', exitInterfaceId: 'Gi0/1', packet, event })
    expect(log).toEqual(['acl-in:64', 'nat-in:63', 'nat-out:64', 'acl-out:63'])
    expect(inbound.kind === 'pass' && inbound.packet.ttl).toBe(62)
    expect(outbound.kind === 'pass' && outbound.packet.ttl).toBe(62)
  })

  it('stops at the first drop', () => {
    const log: string[] = []
    const chain = new PacketPolicyChain([new Recorder('acl', log, 'ingress'), new Recorder('nat', log)])
    expect(chain.ingress(ctx, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event })).toEqual({ kind: 'drop', reason: 'aclDenied', icmp: 'adminProhibited' })
    expect(log).toEqual(['acl-in:64'])
  })

  it('the prelude chain passes the same packet object', () => {
    const chain = SecurityPolicies.create()
    const verdict = chain.ingress(ctx, { interfaceId: 'Gi0/0', packet, linkBroadcast: false, event })
    expect(verdict.kind === 'pass' && verdict.packet).toBe(packet)
  })
})
