// Pack 5.2 cross-feature checks (docs/SECURITY_PACK.md §10): ACL and NAT on one router follow the IOS
// order of operations, and a lab using ACL + NAT + SSH data survives the lab file and the share link.
import { describe, expect, it } from 'vitest'
import { StateInvariants, type AccessList, type NetworkState, type SolveCondition } from '../../domain'
import { LabSerializer } from '../../lab/LabSerializer'
import { LabShareLink } from '../../lab/LabShareLink'
import { openSampleLab } from '../../samples/contract'
import { securityOfficePat } from '../../samples/content/securitySamples'
import { SimSolveChecker } from '../../sim'
import { editDevice } from './securityFixes'
import { ANY, accessGroup, accessLists, management, natRules, net } from './securitySetup'

const HOST = '0.0.0.0'

function hostMatch(address: string) {
  return { address, wildcard: HOST }
}

/** Extended list: deny ip <source> any, then permit ip any any. */
function denySource(name: string, source: ReturnType<typeof net>): AccessList {
  return {
    name,
    type: 'extended',
    entries: [
      { seq: 10, kind: 'extended', action: 'deny', protocol: 'ip', source, destination: ANY },
      { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY },
    ],
  }
}

function reachesWeb(state: NetworkState, ...pcs: string[]): boolean[] {
  const conditions = pcs.map((fromDeviceId): SolveCondition => ({ type: 'reachable', fromDeviceId, toDeviceId: 'web1' }))
  return SimSolveChecker.check(state, conditions).map((result) => result.ok)
}

describe('ACL and NAT on one router: order of operations', () => {
  const office = securityOfficePat.lab().state

  it('an inbound ACL on the inside port sees the private source (before NAT)', () => {
    const state = editDevice(office, 'r1', accessLists([denySource('NO_PC2', hostMatch('192.168.1.11'))]), accessGroup('Gi0/0', 'NO_PC2', 'in'))
    expect(reachesWeb(state, 'pc1', 'pc2')).toEqual([true, false])
  })

  it('an outbound ACL on the outside port sees the translated source (after NAT)', () => {
    const privateSource = editDevice(office, 'r1', accessLists([denySource('NO_PC2', hostMatch('192.168.1.11'))]), accessGroup('Gi0/1', 'NO_PC2', 'out'))
    expect(reachesWeb(privateSource, 'pc1', 'pc2')).toEqual([true, true])
    const publicSource = editDevice(office, 'r1', accessLists([denySource('NO_WAN', hostMatch('203.0.113.2'))]), accessGroup('Gi0/1', 'NO_WAN', 'out'))
    expect(reachesWeb(publicSource, 'pc1', 'pc2')).toEqual([false, false])
  })

  it('an inbound ACL on the outside port sees the reply before NAT puts the private address back', () => {
    const toPrivate = editDevice(office, 'r1', accessLists([denyDestination('NO_TO_PC1', '192.168.1.10')]), accessGroup('Gi0/1', 'NO_TO_PC1', 'in'))
    expect(reachesWeb(toPrivate, 'pc1', 'pc2')).toEqual([true, true])
    const toPublic = editDevice(office, 'r1', accessLists([denyDestination('NO_TO_WAN', '203.0.113.2')]), accessGroup('Gi0/1', 'NO_TO_WAN', 'in'))
    expect(reachesWeb(toPublic, 'pc1', 'pc2')).toEqual([false, false])
  })
})

function denyDestination(name: string, address: string): AccessList {
  return {
    name,
    type: 'extended',
    entries: [
      { seq: 10, kind: 'extended', action: 'deny', protocol: 'ip', source: ANY, destination: hostMatch(address) },
      { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY },
    ],
  }
}

/** The office PAT sample plus every kind of pack 5.2 data on R1. */
function fullPackLab() {
  const doc = openSampleLab(securityOfficePat, { title: 'pack 5.2' })
  const state = editDevice(
    doc.state,
    'r1',
    accessLists([
      { name: 'MGMT', type: 'standard', entries: [{ seq: 5, kind: 'remark', text: 'IT only' }, { seq: 10, kind: 'standard', action: 'permit', source: net('192.168.1.0', '0.0.0.255'), log: true }] },
      {
        name: '101',
        type: 'extended',
        entries: [
          { seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: ANY, destination: hostMatch('203.0.113.2'), destinationPort: { op: 'eq', port: 443 }, established: true },
          { seq: 20, kind: 'extended', action: 'permit', protocol: 'udp', source: ANY, sourcePort: { op: 'range', from: 1024, to: 65535 }, destination: ANY },
          { seq: 30, kind: 'extended', action: 'permit', protocol: 'icmp', source: ANY, destination: ANY, icmpType: 0, icmpCode: 0 },
        ],
      },
    ]),
    accessGroup('Gi0/1', '101', 'in'),
    natRules({
      pools: [{ name: 'SPARE', start: '203.0.113.2', end: '203.0.113.2', netmask: '255.255.255.252' }],
      statics: [
        { kind: 'static', insideLocal: '192.168.1.50', insideGlobal: '203.0.113.2', protocol: 'tcp', insideLocalPort: 80, insideGlobalPort: 8080 },
      ],
      dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1' }, overload: true }],
    }),
    management({
      hostname: 'R1',
      domainName: 'lab.local',
      users: [{ name: 'admin', secret: 'Str0ng!', privilege: 15 }, { name: 'audit', password: 'readonly' }],
      ssh: { version: 2, rsaKeyBits: 2048, timeoutSeconds: 60, authRetries: 2 },
      lines: { vty: { loginLocal: true, transportInput: ['ssh'], accessClass: { in: 'MGMT' } }, console: { password: 'con', login: true } },
    }),
  )
  return { ...doc, state }
}

describe('a lab with ACL + NAT + SSH data', () => {
  const doc = fullPackLab()

  it('is a valid lab', () => {
    expect(new StateInvariants().violations(doc.state)).toEqual([])
  })

  it('round-trips through the lab file unchanged', () => {
    const serializer = new LabSerializer()
    for (const text of [serializer.serialize(doc), serializer.serializeCompact(doc)]) {
      const parsed = serializer.parse(JSON.parse(text))
      expect(parsed.ok && parsed.doc).toEqual(doc)
    }
  })

  it('round-trips through the share link unchanged', () => {
    const shareLink = new LabShareLink()
    const encoded = shareLink.encode(doc)
    if (!encoded.ok) throw new Error('expected a share hash')
    const decoded = shareLink.decode(encoded.hash)
    expect(decoded?.ok && decoded.doc).toEqual(doc)
  })
})
