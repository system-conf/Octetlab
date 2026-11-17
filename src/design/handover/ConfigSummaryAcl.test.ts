import { describe, expect, it } from 'vitest'
import type { Device, LabDocument, NetworkState } from '../../domain'
import { labHost, labLink, labRouter } from '../../engine/testLabs'
import { HandoverPack, type HandoverSource } from './HandoverPack'

const META: LabDocument['meta'] = { title: 'Cafe', author: '', createdAt: '2026-11-17T10:00:00.000Z', updatedAt: '2026-11-17T10:00:00.000Z' }

function source(state: NetworkState): HandoverSource {
  const layout = { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 120 * index, y: 0 }])) }
  return { meta: META, state, layout, annotations: [] }
}

/** A router whose guest port binds GUEST_IN inbound, with the list itself. */
function guardedRouter(): Device {
  const router = labRouter('router', [{ id: 'Gi0/0', ip: '192.168.30.1' }])
  const ports = router.ports.map((port) =>
    port.role === 'routed' ? { ...port, l3: { ...port.l3, features: { accessGroups: { in: 'GUEST_IN' } } } } : port,
  )
  return {
    ...router,
    ports,
    features: {
      accessLists: {
        lists: [
          {
            name: 'GUEST_IN',
            type: 'extended',
            entries: [
              { seq: 10, kind: 'extended', action: 'deny', protocol: 'ip', source: { address: '192.168.30.0', wildcard: '0.0.0.255' }, destination: { address: '192.168.0.0', wildcard: '0.0.255.255' } },
              { seq: 20, kind: 'extended', action: 'permit', protocol: 'ip', source: { address: '0.0.0.0', wildcard: '255.255.255.255' }, destination: { address: '0.0.0.0', wildcard: '255.255.255.255' } },
            ],
          },
        ],
      },
    },
  }
}

describe('ConfigSummaryBuilder: access lists', () => {
  it('documents the binding on the interface and every entry of the list', () => {
    const state: NetworkState = { devices: [guardedRouter(), labHost('pc1', '192.168.30.10')], links: [labLink('l1', ['router', 'Gi0/0'], ['pc1', 'eth0'])] }
    const items = HandoverPack.build(source(state)).configs.find((config) => config.deviceId === 'router')?.items ?? []
    expect(items).toContainEqual({
      label: { key: 'design:handover.config.accessGroup', params: { interface: 'Gi0/0' } },
      value: { key: 'design:handover.values.aclIn', params: { name: 'GUEST_IN' } },
    })
    expect(items).toContainEqual({
      label: { key: 'design:handover.config.accessList', params: { name: 'GUEST_IN' } },
      value: 'deny ip 192.168.30.0 0.0.0.255 192.168.0.0 0.0.255.255 · permit ip any any',
    })
  })

  it('leaves out a DHCP network card that has no address and no cable', () => {
    const host = labHost('laptop', '', { addressing: 'dhcp' })
    const state: NetworkState = { devices: [host], links: [] }
    const laptop = HandoverPack.build(source(state)).configs.find((config) => config.deviceId === 'laptop')
    expect(laptop?.items.some((item) => item.label.key === 'design:handover.config.interface') ?? false).toBe(false)
  })
})
