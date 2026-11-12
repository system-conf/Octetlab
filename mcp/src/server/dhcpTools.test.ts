import { describe, expect, it } from 'vitest'
import type { LeaseOutcome } from '../lab/DhcpLeases'
import type { LiveEvent } from '../live/LiveEvent'
import { McpTestClient } from './McpTestClient'

const ROUTER_DHCP = [
  'ip dhcp excluded-address 192.168.1.1 192.168.1.9',
  'ip dhcp pool LAN',
  ' network 192.168.1.0 255.255.255.0',
  ' default-router 192.168.1.1',
  ' dns-server 8.8.8.8',
  'interface Gi0/0',
  ' ip address 192.168.1.1 255.255.255.0',
  ' no shutdown',
].join('\n')

/** Router with a DHCP pool, a switch and terminal-less DHCP clients (camera, phone, printer). */
const FACTORY = {
  title: 'Factory',
  devices: [
    { ref: 'r1', modelId: 'router2Port' },
    { ref: 'sw', modelId: 'switch8' },
    { ref: 'cam', modelId: 'ipCamera' },
    { ref: 'phone', modelId: 'ipPhone' },
    { ref: 'printer', modelId: 'printer' },
  ],
  links: [{ a: 'r1', b: 'sw', portA: 'Gi0/0' }, { a: 'cam', b: 'sw' }, { a: 'phone', b: 'sw' }, { a: 'printer', b: 'sw' }],
  hosts: [{ deviceId: 'cam', mode: 'dhcp' }],
  cli: [{ deviceRef: 'r1', config: ROUTER_DHCP }],
}

async function events(client: McpTestClient, labId: string): Promise<LiveEvent[]> {
  return (await client.rooms.room(labId).snapshot())?.events ?? []
}

function ipOf(lab: Record<string, unknown>, deviceId: string): string | undefined {
  const devices = lab.devices as { id: string; ports: { id: string; ip?: string }[] }[]
  return devices.find((device) => device.id === deviceId)?.ports[0]?.ip
}

describe('DHCP leases through the MCP tools', () => {
  it('build_lab leases addresses to terminal-less devices after the routers are configured', async () => {
    const client = new McpTestClient()
    const built = await client.ok('build_lab', FACTORY)
    const labId = String(built.structured.labId)
    const leases = built.structured.leases as LeaseOutcome[]
    expect(leases).toHaveLength(3)
    expect(leases.every((lease) => lease.ok)).toBe(true)
    expect(built.text).toContain('Got DHCP leases on 3 cards.')
    expect(built.text).toContain('DHCP leases:')
    const lab = (await client.ok('get_lab', { labId })).structured
    expect(ipOf(lab, 'camera1')).toMatch(/^192\.168\.1\.\d+\/255\.255\.255\.0 \(dhcp\)$/)
    expect(ipOf(lab, 'printer1')).toMatch(/\(dhcp\)$/)
    expect(await events(client, labId)).toHaveLength(1)
  })

  it('gives wireless clients a lease from a wireless router', async () => {
    const client = new McpTestClient()
    const built = await client.ok('build_lab', {
      devices: [{ ref: 'home', modelId: 'wirelessRouter' }, { ref: 'phone', modelId: 'smartphone' }, { ref: 'tab', modelId: 'tablet' }],
      links: [{ a: 'phone', b: 'home' }, { a: 'tab', b: 'home' }],
    })
    expect((built.structured.leases as LeaseOutcome[]).map((lease) => [lease.deviceId, lease.ok])).toEqual([
      ['smartphone1', true],
      ['tablet1', true],
    ])
  })

  it('configure_host in DHCP mode asks for a lease and reports why there is none', async () => {
    const client = new McpTestClient()
    const labId = String((await client.ok('build_lab', { devices: [{ ref: 'cam', modelId: 'ipCamera' }] })).structured.labId)
    const lonely = await client.ok('configure_host', { labId, deviceId: 'camera1', mode: 'dhcp' })
    expect(lonely.text).toContain('camera1 eth0: the network card has no working cable or wireless link')
    expect((await events(client, labId)).at(-1)?.summary).toBe('Configured Camera 1 eth0: DHCP. No DHCP lease (1 card asked).')
  })

  it('renew_dhcp renews chosen or all clients and refuses non-clients', async () => {
    const client = new McpTestClient()
    const labId = String((await client.ok('build_lab', FACTORY)).structured.labId)
    await client.ok('set_cable_connected', { labId, linkId: 'link2', connected: false })
    const unplugged = await client.ok('renew_dhcp', { labId, deviceIds: ['camera1'] })
    expect((unplugged.structured.leases as LeaseOutcome[])[0]).toMatchObject({ deviceId: 'camera1', ok: false })
    await client.ok('set_cable_connected', { labId, linkId: 'link2', connected: true })
    const all = await client.ok('renew_dhcp', { labId })
    expect((all.structured.leases as LeaseOutcome[]).map((lease) => [lease.deviceId, lease.ok])).toEqual([
      ['camera1', true],
      ['ipPhone1', true],
      ['printer1', true],
    ])
    expect((await events(client, labId)).at(-1)).toMatchObject({ tool: 'renew_dhcp', summary: 'Got DHCP leases on 3 cards.' })
    expect(await client.call('renew_dhcp', { labId, deviceIds: ['router1'] })).toMatchObject({ isError: true, structured: { error: 'validation' } })
  })

  it('reaches the internet through a WAN port without an address via a default route out of it (as the app samples do)', async () => {
    const client = new McpTestClient()
    const built = await client.ok('build_lab', {
      devices: [{ ref: 'isp', modelId: 'internetCloud' }, { ref: 'r1', modelId: 'router2Port' }, { ref: 'pc', modelId: 'pc' }],
      links: [{ a: 'r1', b: 'isp', portA: 'Gi0/1' }, { a: 'pc', b: 'r1', portB: 'Gi0/0' }],
      hosts: [{ deviceId: 'pc', mode: 'static', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' }],
      cli: [{ deviceRef: 'r1', config: 'interface Gi0/0\n ip address 192.168.1.1 255.255.255.0\n no shutdown\ninterface Gi0/1\n ip address dhcp\n no shutdown\nip route 0.0.0.0 0.0.0.0 Gi0/1' }],
    })
    const labId = String(built.structured.labId)
    const ping = await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ping 8.8.8.8' })
    expect(ping.text).toContain('Reply from 8.8.8.8')
  })
})
