// Property test: any sequence of LabEditor calls keeps the lab consistent (StateInvariants clean,
// layout = devices, loadable after serialize). Refusals must leave the document untouched.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CableRules,
  StateInvariants,
  type Annotation,
  type CableType,
  type DeviceKind,
  type Device,
  type DeviceFeatures,
  type L3Settings,
  type LabDocument,
  type Link,
  type Port,
} from '../domain'
import { LabEditor } from './LabEditor'
import { LabSerializer } from './LabSerializer'
import { sampleLab } from './testLabs'

const editor = new LabEditor()
const cableRules = new CableRules()
const invariants = new StateInvariants()
const serializer = new LabSerializer()

let macCounter = 0
function nextMac(): string {
  macCounter += 1
  const hex = macCounter.toString(16).toUpperCase().padStart(4, '0')
  return `02:EE:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}`
}

const NO_ADDRESS: L3Settings = { ipv4: { addressing: 'dhcp', address: '', mask: '' } }

function port(id: string, role: Port['role'], medium: Port['medium']): Port {
  const mac = medium === 'serial' || medium === 'console' ? {} : { mac: nextMac() }
  const common = { id, medium, adminUp: true, ...mac }
  switch (role) {
    case 'switched':
      return { ...common, role, l2: { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' } }
    case 'routed':
      return { ...common, role, l3: NO_ADDRESS, subInterfaces: [] }
    case 'host':
      return { ...common, role, l3: NO_ADDRESS }
    case 'radio':
    case 'console':
    case 'passive':
      return { ...common, role }
  }
}

const BUILDERS: Readonly<Partial<Record<DeviceKind, () => Port[]>>> = {
  pc: () => [port('eth0', 'host', 'copper'), port('wlan0', 'host', 'wireless'), port('RS232', 'console', 'console')],
  laptop: () => [port('wlan0', 'host', 'wireless')],
  switch: () => [port('Fa0/1', 'switched', 'copper'), port('Fa0/2', 'switched', 'copper'), port('Gi0/1', 'switched', 'fiber'), port('Console', 'console', 'console')],
  router: () => [port('Gi0/0', 'routed', 'copper'), port('Se0/0/0', 'routed', 'serial'), port('Console', 'console', 'console')],
  accessPoint: () => [port('Gi0', 'switched', 'copper'), port('Radio0', 'radio', 'wireless')],
  hub: () => [port('Eth0', 'passive', 'copper'), port('Eth1', 'passive', 'copper')],
  firewall: () => [port('Gi0/0', 'routed', 'copper'), port('Gi0/1', 'routed', 'copper'), port('Console', 'console', 'console')],
}
const KINDS = Object.keys(BUILDERS) as DeviceKind[]
const CABLES: CableType[] = ['copperStraight', 'copperCross', 'fiber', 'serial', 'console', 'coaxial', 'wireless']

/** Pack 5.2 data every generated router carries: lists, NAT, local AAA / SSH (docs/SECURITY_PACK.md §3). */
const ROUTER_SECURITY: DeviceFeatures = {
  accessLists: {
    lists: [
      { name: '1', type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'permit', source: { address: '192.168.1.0', wildcard: '0.0.0.255' } }] },
      {
        name: 'EDGE_IN',
        type: 'extended',
        entries: [
          { seq: 5, kind: 'remark', text: 'web only' },
          { seq: 10, kind: 'extended', action: 'permit', protocol: 'tcp', source: { address: '0.0.0.0', wildcard: '255.255.255.255' }, destination: { address: '10.0.0.1', wildcard: '0.0.0.0' }, destinationPort: { op: 'eq', port: 443 } },
        ],
      },
    ],
  },
  nat: { pools: [], statics: [], dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/0' }, overload: true }] },
  management: { domainName: 'lab.local', users: [{ name: 'admin', secret: 's', privilege: 15 }], ssh: { version: 2, rsaKeyBits: 1024 }, lines: { vty: { loginLocal: true, transportInput: ['ssh'] } } },
}

function withSecurity(device: Device): Device {
  const ports = device.ports.map((item): Port =>
    item.role === 'routed' && item.id === 'Gi0/0' ? { ...item, l3: { ...item.l3, features: { accessGroups: { in: 'EDGE_IN' }, natRole: 'outside' } } } : item,
  )
  return { ...device, ports, features: ROUTER_SECURITY }
}

/** Firewall pack data: nameif / level on both routed ports and the device-wide settings. */
function withFirewall(device: Device): Device {
  const names: Readonly<Record<string, { nameif: string; securityLevel: number }>> = {
    'Gi0/0': { nameif: 'outside', securityLevel: 0 },
    'Gi0/1': { nameif: 'inside', securityLevel: 100 },
  }
  const ports = device.ports.map((item): Port => {
    const firewall = names[item.id]
    return item.role === 'routed' && firewall !== undefined ? { ...item, l3: { ...item.l3, features: { firewall } } } : item
  })
  return { ...device, ports, routing: { ipRouting: true, staticRoutes: [] }, features: { firewall: { inspectIcmp: true, timeouts: { tcp: 3600 } } } }
}

function build(kind: DeviceKind, id: string): Device {
  const ports = BUILDERS[kind]?.() ?? []
  const base: Device = { id, kind, modelId: kind, name: id, powered: true, baseMac: nextMac(), ports }
  if (kind === 'router') return withSecurity(base)
  if (kind === 'firewall') return withFirewall(base)
  return kind === 'accessPoint' ? { ...base, wireless: { ssids: [{ ssid: 'Office', vlan: 1, security: { mode: 'open' } }] } } : base
}

function pick<Item>(items: readonly Item[], index: number): Item | undefined {
  return items.length === 0 ? undefined : items[index % items.length]
}

type Step = (doc: LabDocument) => LabDocument

/** Ports without a cable (radio ports always count as free). */
function freePorts(doc: LabDocument, device: Device): Port[] {
  const used = new Set(doc.state.links.flatMap((link) => [link.a, link.b]).filter((end) => end.deviceId === device.id).map((end) => end.portId))
  return device.ports.filter((item) => item.role === 'radio' || !used.has(item.id))
}

/** How often interesting outcomes happened, so the test proves it exercised them. */
const seen = { connected: 0, refused: 0, linkDroppedByUpdate: 0, updateRefused: 0, removedWithLinks: 0, securityEdited: 0 }

const index = fc.nat({ max: 50 })
const coordinate = fc.integer({ min: -2000, max: 2000 })

const addStep = fc.record({ kind: fc.constantFrom(...KINDS), x: coordinate, y: coordinate }).map(
  ({ kind, x, y }): Step => (doc) => editor.addDevice(doc, build(kind, editor.nextDeviceId(doc, kind)), { x, y }),
)

const removeStep = fc.array(index, { maxLength: 3 }).map(
  (picks): Step => (doc) => {
    const next = editor.removeDevices(doc, picks.map((i) => pick(doc.state.devices, i)?.id ?? 'ghost'))
    if (next.state.links.length < doc.state.links.length) seen.removedWithLinks += 1
    return next
  },
)

const moveStep = fc.record({ i: index, x: coordinate, y: coordinate }).map(
  ({ i, x, y }): Step => (doc) => editor.moveDevices(doc, [{ id: pick(doc.state.devices, i)?.id ?? 'ghost', to: { x, y } }]),
)

const connectStep = fc
  .record({ a: index, pa: index, b: index, pb: index, cable: fc.constantFrom<CableType | 'auto'>('auto', 'auto', 'auto', ...CABLES), ssid: fc.constantFrom('Office', 'Guest', ' ') })
  .map(
    ({ a, pa, b, pb, cable: tool, ssid }): Step =>
      (doc) => {
        const first = pick(doc.state.devices, a)
        const second = pick(doc.state.devices, a + 1 + b)
        const portA = first && pick(freePorts(doc, first), pa)
        const portB = second && pick(freePorts(doc, second).filter((item) => item.medium === portA?.medium), pb)
        if (!first || !second || !portA || !portB) return doc
        const ends = { id: editor.nextLinkId(doc), a: { deviceId: first.id, portId: portA.id }, b: { deviceId: second.id, portId: portB.id }, connected: true }
        const cable = tool === 'auto' ? (cableRules.autoCable(doc.state, ends.a, ends.b) ?? 'copperStraight') : tool
        const link: Link =
          cable === 'serial' ? { ...ends, cable, dceEnd: 'a' } : cable === 'wireless' ? { ...ends, cable, ssid } : { ...ends, cable }
        const result = editor.connect(doc, link)
        if (result.ok) {
          seen.connected += 1
          return result.doc
        }
        seen.refused += 1
        expect(result.refusal).toBeTypeOf('string')
        return doc
      },
  )

const linkStep = fc.record({ i: index, remove: fc.boolean(), connected: fc.boolean() }).map(
  ({ i, remove, connected }): Step => (doc) => {
    const id = pick(doc.state.links, i)?.id ?? 'ghost'
    return remove ? editor.disconnect(doc, id) : editor.setLinkConnected(doc, id, connected)
  },
)

const PORT_CHANGES = ['dropPort', 'fiber', 'mdixOff', 'badVlan', 'duplicatePort', 'rename', 'dropLists', 'duplicateAcl'] as const

const updateStep = fc.record({ i: index, p: index, change: fc.constantFrom(...PORT_CHANGES), name: fc.string() }).map(
  ({ i, p, change, name }): Step =>
    (doc) => {
      const target = pick(doc.state.devices, i)
      const chosen = target && pick(target.ports, p)
      if (!target || !chosen) return doc
      const replacePort = (next: Port): Device => ({ ...target, ports: target.ports.map((item) => (item === chosen ? next : item)) })
      switch (change) {
        case 'dropPort': {
          const next = editor.updateDevice(doc, { ...target, ports: target.ports.filter((item) => item !== chosen) })
          if (next.state.links.length < doc.state.links.length) seen.linkDroppedByUpdate += 1
          return next
        }
        case 'fiber':
          return editor.updateDevice(doc, replacePort({ ...chosen, medium: 'fiber' }))
        case 'mdixOff':
          return editor.updateDevice(doc, replacePort({ ...chosen, autoMdix: false, pinout: 'mdi' }))
        case 'badVlan':
          return chosen.role === 'switched'
            ? expectRefused(doc, { ...target, ports: target.ports.map((item) => (item === chosen ? { ...chosen, l2: { ...chosen.l2, accessVlan: 0 } } : item)) })
            : doc
        case 'duplicatePort':
          return expectRefused(doc, { ...target, ports: [...target.ports, { ...chosen, mac: undefined }] })
        case 'rename':
          return editor.renameDevice(doc, target.id, name)
        case 'dropLists': {
          // Toggles the lists: bindings to a list that no longer exists stay valid (they permit everything,
          // SECURITY_PACK.md §2.4); a device without lists gets the router's pack 5.2 data.
          seen.securityEdited += 1
          const lists = (target.features?.accessLists?.lists.length ?? 0) > 0 ? { lists: [] } : ROUTER_SECURITY.accessLists
          return editor.updateDevice(doc, { ...target, features: { ...target.features, accessLists: lists } })
        }
        case 'duplicateAcl': {
          const list = target.features?.accessLists?.lists[0]
          if (!list) return doc
          return expectRefused(doc, { ...target, features: { ...target.features, accessLists: { lists: [list, list] } } })
        }
      }
    },
)

function expectRefused(doc: LabDocument, device: Device): LabDocument {
  const next = editor.updateDevice(doc, device)
  expect(next).toBe(doc)
  seen.updateRefused += 1
  return next
}

const annotationStep = fc.record({ i: index, op: fc.constantFrom('add', 'update', 'remove'), x: coordinate, text: fc.string() }).map(
  ({ i, op, x, text }): Step =>
    (doc) => {
      const existing = pick(doc.annotations, i)
      if (op === 'add') {
        const note: Annotation = { id: editor.nextAnnotationId(doc), type: 'text', color: 'amber', at: { x, y: 0 }, text, size: 'small' }
        return editor.addAnnotation(doc, note)
      }
      if (!existing) return doc
      return op === 'remove' ? editor.removeAnnotation(doc, existing.id) : editor.updateAnnotation(doc, { ...existing, color: 'red' })
    },
)

const step = fc.oneof(addStep, addStep, removeStep, moveStep, connectStep, connectStep, connectStep, linkStep, updateStep, updateStep, annotationStep)

function securityData(device: Device): unknown {
  const l3 = device.ports.flatMap((item) => (item.role === 'routed' ? [item.l3.features ?? null] : []))
  return { features: device.features ?? null, l3 }
}

function expectConsistent(doc: LabDocument): void {
  expect(invariants.violations(doc.state)).toEqual([])
  expect(Object.keys(doc.layout.devices).sort()).toEqual(doc.state.devices.map((device) => device.id).sort())
  const reloaded = serializer.parse(serializer.serialize(doc))
  expect(reloaded.ok).toBe(true)
  // Pack 5.2 data (device features, port bindings and NAT roles) comes back exactly.
  if (reloaded.ok) expect(reloaded.doc.state.devices.map(securityData)).toEqual(doc.state.devices.map(securityData))
}

describe('LabEditor random edit sequences', () => {
  it('keep every intermediate lab consistent and loadable', () => {
    fc.assert(
      fc.property(fc.constantFrom(true, true, true, false), fc.array(step, { minLength: 1, maxLength: 40 }), (fromSample, steps) => {
        let doc = fromSample ? sampleLab() : editor.removeDevices(sampleLab(), sampleLab().state.devices.map((d) => d.id))
        for (const apply of steps) {
          doc = apply(doc)
          expectConsistent(doc)
        }
      }),
      { numRuns: 200 },
    )
    for (const [outcome, count] of Object.entries(seen)) expect(count, outcome).toBeGreaterThan(0)
  })
})
