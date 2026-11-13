import { describe, expect, it } from 'vitest'
import { ShareTableBuilder } from './ShareTables'
import { shareTestLab } from './testShareLab'

describe('ShareTableBuilder', () => {
  const tables = ShareTableBuilder.build(shareTestLab())
  const row = (deviceId: string) => tables.devices.find((device) => device.deviceId === deviceId)

  it('lists every device with its addressed interfaces and the access VLAN of its switchport', () => {
    expect(tables.devices).toHaveLength(8)
    expect(row('guestPc')?.interfaces).toEqual([{ interfaceId: 'eth0', address: '192.168.20.50/24', dhcp: false, vlan: 20 }])
    expect(row('kasa')?.interfaces[0]).toMatchObject({ address: '192.168.10.20/24', vlan: 10 })
    // DHCP host behind an access point: no switchport VLAN to report.
    expect(row('phone')?.interfaces[0]).toMatchObject({ address: '192.168.20.101/24', dhcp: true, vlan: null })
  })

  it('reports router sub-interfaces with their dot1Q VLAN', () => {
    const router = row('router')
    expect(router?.interfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interfaceId: 'Gi0/0.10', address: '192.168.10.1/24', vlan: 10 }),
        expect.objectContaining({ interfaceId: 'Gi0/0.20', address: '192.168.20.1/24', vlan: 20 }),
      ]),
    )
  })

  it('collects the VLAN database of the switches', () => {
    const ids = tables.vlans.map((vlan) => vlan.id)
    expect(ids).toEqual(expect.arrayContaining([1, 10, 20]))
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(tables.vlans.find((vlan) => vlan.id === 10)?.switches).toEqual(['Switch'])
  })

  it('groups addresses into subnets, sorted by network', () => {
    const networks = tables.subnets.map((subnet) => subnet.network)
    expect(networks.indexOf('192.168.10.0/24')).toBeLessThan(networks.indexOf('192.168.20.0/24'))
    const vlan10 = tables.subnets.find((subnet) => subnet.network === '192.168.10.0/24')
    expect(vlan10?.members.map((member) => member.address)).toEqual(expect.arrayContaining(['192.168.10.1', '192.168.10.20', '192.168.10.30']))
  })
})
