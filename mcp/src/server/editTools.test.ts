import { describe, expect, it } from 'vitest'
import type { LiveEvent } from '../live/LiveEvent'
import { McpTestClient } from './McpTestClient'

async function newLab(client: McpTestClient, title = 'Edits'): Promise<string> {
  return String((await client.ok('create_lab', { title })).structured.labId)
}

async function lastEvent(client: McpTestClient, labId: string): Promise<LiveEvent | undefined> {
  return (await client.rooms.room(labId).snapshot())?.events.at(-1)
}

async function eventCount(client: McpTestClient, labId: string): Promise<number> {
  return (await client.rooms.room(labId).snapshot())?.events.length ?? 0
}

describe('update_lab_info', () => {
  it('sets title, description and notes, appends notes and shows them in get_lab', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    const set = await client.ok('update_lab_info', { labId, title: 'Cafe network', description: 'Two VLANs', notes: 'Step 1: cable it.' })
    expect(set.structured).toMatchObject({ changes: ['title', 'description', 'notes'], title: 'Cafe network', description: 'Two VLANs' })
    expect(await lastEvent(client, labId)).toMatchObject({ tool: 'update_lab_info', summary: "Updated the lab's title, description and notes." })
    await client.ok('update_lab_info', { labId, appendNotes: 'Step 2: ping.' })
    const lab = await client.ok('get_lab', { labId })
    expect(lab.structured).toMatchObject({ title: 'Cafe network', description: 'Two VLANs', notes: 'Step 1: cable it.\nStep 2: ping.' })
    expect(lab.text).toContain('Description: Two VLANs')
    expect(lab.text).toContain('Notes:\nStep 1: cable it.\nStep 2: ping.')
  })

  it('refuses an empty call and notes + appendNotes together without changing the lab', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    expect(await client.call('update_lab_info', { labId })).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(await client.call('update_lab_info', { labId, notes: 'a', appendNotes: 'b' })).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(await eventCount(client, labId)).toBe(1)
  })
})

describe('edit_annotations', () => {
  it('adds, updates and removes annotations with one event per call', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    const added = await client.ok('edit_annotations', {
      labId,
      add: [
        { type: 'text', at: { x: 10, y: 20 }, text: 'Kitchen' },
        { type: 'rectangle', at: { x: 0, y: 0 }, width: 300, height: 200, label: 'Kitchen area', color: 'green' },
        { type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, arrow: true },
      ],
    })
    expect(added.structured.added).toEqual(['annotation1', 'annotation2', 'annotation3'])
    expect(await lastEvent(client, labId)).toMatchObject({ tool: 'edit_annotations', summary: 'Added 3 annotations.' })

    await client.ok('edit_annotations', { labId, update: [{ id: 'annotation1', text: 'Kitchen POS', color: 'red' }, { id: 'annotation2', label: '' }], remove: ['annotation3'] })
    expect(await lastEvent(client, labId)).toMatchObject({ summary: 'Changed 2 and removed 1 annotations.' })
    const lab = await client.ok('get_lab', { labId })
    expect(lab.structured.annotations).toEqual([
      { id: 'annotation1', type: 'text', at: { x: 10, y: 20 }, text: 'Kitchen POS', size: 'medium', color: 'red' },
      { id: 'annotation2', type: 'rectangle', at: { x: 0, y: 0 }, width: 300, height: 200, filled: false, color: 'green' },
    ])
    expect(lab.text).toContain('- annotation1: text at (10,20) red "Kitchen POS"')
  })

  it('refuses missing or foreign fields and unknown ids, saving nothing', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    const missing = await client.call('edit_annotations', { labId, add: [{ type: 'rectangle', at: { x: 0, y: 0 } }] })
    expect(missing).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(missing.text).toContain('needs at, width and height')
    const foreign = await client.call('edit_annotations', { labId, add: [{ type: 'line', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, text: 'x' }] })
    expect(foreign.text).toContain('a line annotation has no text')
    expect(await client.call('edit_annotations', { labId, remove: ['annotation9'] })).toMatchObject({ isError: true, structured: { error: 'notFound' } })
    expect(await client.call('edit_annotations', { labId })).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(await eventCount(client, labId)).toBe(1)
  })
})

describe('configure_device', () => {
  it('renames and moves a device', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    await client.ok('add_device', { labId, modelId: 'pc' })
    const result = await client.ok('configure_device', { labId, deviceId: 'pc1', name: 'Front desk', x: 400, y: 120 })
    expect(result.structured).toMatchObject({ changes: ['name', 'position'], name: 'Front desk', position: { x: 400, y: 120 } })
    expect(await lastEvent(client, labId)).toMatchObject({ tool: 'configure_device', summary: 'Changed the name and position of Front desk.', deviceIds: ['pc1'] })
    expect(await client.call('configure_device', { labId, deviceId: 'pc1', x: 5 })).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(await client.call('configure_device', { labId, deviceId: 'pc1', name: 'x'.repeat(41) })).toMatchObject({ isError: true })
    expect(await client.call('configure_device', { labId, deviceId: 'pc9', name: 'Nope' })).toMatchObject({ isError: true, structured: { error: 'notFound' } })
  })

  it('sets SSIDs on an access point and refuses them on a PC', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    await client.ok('add_device', { labId, modelId: 'accessPoint' })
    await client.ok('add_device', { labId, modelId: 'pc' })
    const result = await client.ok('configure_device', { labId, deviceId: 'accessPoint1', ssids: [{ ssid: 'Cafe-Guest', vlan: 20 }, { ssid: 'Cafe-Staff' }] })
    expect(result.structured.settings).toEqual({ ssids: [{ ssid: 'Cafe-Guest', vlan: 20, security: 'open' }, { ssid: 'Cafe-Staff', vlan: 1, security: 'open' }] })
    const duplicate = await client.call('configure_device', { labId, deviceId: 'accessPoint1', ssids: [{ ssid: 'A' }, { ssid: 'A' }] })
    expect(duplicate.text).toContain('ssids[1].ssid: The name A is already used.')
    const onPc = await client.call('configure_device', { labId, deviceId: 'pc1', ssids: [{ ssid: 'A' }] })
    expect(onPc).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(onPc.text).toContain('SSIDs exist only on access points and wireless routers')
  })

  it('runs DHCP and DNS servers on a server with the GUI rules, and keeps leases of a kept pool', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    await client.ok('add_device', { labId, modelId: 'server' })
    const dhcp = { enabled: true, pools: [{ name: 'LAN', network: '192.168.1.0', mask: '255.255.255.0', rangeStart: '192.168.1.100', rangeEnd: '192.168.1.150', defaultRouter: '192.168.1.1', dnsServers: ['192.168.1.2'] }], excludedRanges: [{ start: '192.168.1.1', end: '192.168.1.10' }] }
    await client.ok('configure_device', { labId, deviceId: 'server1', dhcp, dns: { enabled: true, records: [{ name: 'Intranet.Local', address: '192.168.1.2' }], forwarders: ['8.8.8.8'] } })
    const lab = await client.ok('get_lab', { labId })
    const server = (lab.structured.devices as { id: string; settings: Record<string, unknown> }[]).find((device) => device.id === 'server1')
    expect(server?.settings.dhcp).toEqual({
      enabled: true,
      pools: [{ name: 'LAN', network: '192.168.1.0', mask: '255.255.255.0', rangeStart: '192.168.1.100', rangeEnd: '192.168.1.150', defaultRouter: '192.168.1.1', dnsServers: ['192.168.1.2'], leases: 0 }],
      excludedRanges: [{ start: '192.168.1.1', end: '192.168.1.10' }],
    })
    expect(server?.settings.dns).toEqual({ enabled: true, forwarders: ['8.8.8.8'], records: [{ name: 'intranet.local', address: '192.168.1.2' }] })
    expect(lab.text).toContain('DHCP server on: LAN 192.168.1.0/255.255.255.0 192.168.1.100-192.168.1.150 gw 192.168.1.1')

    await client.ok('configure_device', { labId, deviceId: 'server1', dhcp: { enabled: false } })
    const off = await client.ok('get_lab', { labId })
    expect(off.text).toContain('DHCP server off: LAN')

    const bad = await client.call('configure_device', { labId, deviceId: 'server1', dhcp: { pools: [{ name: 'X', network: '192.168.1.5', mask: '255.255.255.0' }] }, dns: { records: [{ name: 'bad name!', address: '1.2.3.4' }] } })
    expect(bad).toMatchObject({ isError: true, structured: { error: 'validation' } })
    expect(bad.text).toContain('dhcp.pools[0].network: This is not a network address for this mask. Did you mean 192.168.1.0?')
  })

  it('simulates an ISP outage on the internet cloud', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    const cloud = await client.ok('add_device', { labId, modelId: 'internetCloud' })
    const cloudId = String(cloud.structured.deviceId)
    const port = (cloud.structured.ports as string[])[0] ?? ''
    await client.ok('configure_device', { labId, deviceId: cloudId, internetService: [{ portId: port, up: false }] })
    const lab = await client.ok('get_lab', { labId })
    expect(lab.text).toContain(`ISP outage on ${port}`)
    expect(await lastEvent(client, labId)).toMatchObject({ summary: expect.stringContaining('Changed the ISP service of') })
    await client.ok('configure_device', { labId, deviceId: cloudId, internetService: [{ portId: port, up: true }] })
    expect((await client.ok('get_lab', { labId })).text).not.toContain('ISP outage')
    expect(await client.call('configure_device', { labId, deviceId: cloudId, internetService: [{ portId: 'Nope0', up: false }] })).toMatchObject({ isError: true, structured: { error: 'notFound' } })
  })
})

describe('set_cable_connected', () => {
  it('unplugs and plugs a cable back in, keeping it in the lab', async () => {
    const client = new McpTestClient()
    const labId = await newLab(client)
    await client.ok('add_device', { labId, modelId: 'pc', name: 'Till' })
    await client.ok('add_device', { labId, modelId: 'switch8' })
    await client.ok('connect', { labId, deviceA: 'pc1', deviceB: 'switch1' })
    await client.ok('set_cable_connected', { labId, linkId: 'link1', connected: false })
    expect(await lastEvent(client, labId)).toMatchObject({ summary: 'Unplugged the cable between Till and Switch 1.', deviceIds: ['pc1', 'switch1'], linkIds: ['link1'] })
    expect((await client.ok('get_lab', { labId })).text).toContain('link1: pc1 eth0 ↔ switch1 Fa0/1 (copperStraight, unplugged)')
    await client.ok('set_cable_connected', { labId, linkId: 'link1', connected: true })
    expect((await client.ok('get_lab', { labId })).structured.links).toEqual([expect.objectContaining({ id: 'link1', connected: true })])
    expect(await client.call('set_cable_connected', { labId, linkId: 'link7', connected: false })).toMatchObject({ isError: true, structured: { error: 'notFound' } })
  })
})

describe('build_lab with settings, annotations and info', () => {
  it('applies the new sections in one event and reports a failing settings step', async () => {
    const client = new McpTestClient()
    const built = await client.ok('build_lab', {
      title: 'Hotel',
      devices: [{ ref: 'ap', modelId: 'accessPoint' }, { ref: 'srv', modelId: 'server' }],
      settings: [
        { deviceId: 'ap', ssids: [{ ssid: 'Hotel-Guest' }] },
        { deviceId: 'srv', dns: { enabled: true, records: [{ name: 'portal.hotel', address: '10.0.0.5' }] } },
      ],
      annotations: [{ type: 'text', at: { x: 0, y: -80 }, text: 'Lobby' }],
      description: 'Guest Wi-Fi',
      notes: 'Built by the assistant.',
    })
    const labId = String(built.structured.labId)
    expect(built.structured.annotationIds).toEqual(['annotation1'])
    expect(built.text).toContain("Built 2 devices, 1 annotation, configured 2 other devices and set the lab's description and notes. Lab ")
    expect(built.text).not.toContain('DHCP')
    const lab = await client.ok('get_lab', { labId })
    expect(lab.structured).toMatchObject({ description: 'Guest Wi-Fi', notes: 'Built by the assistant.' })
    expect(lab.text).toContain('SSIDs: Hotel-Guest (vlan 1, open)')
    expect(await eventCount(client, labId)).toBe(1)

    const failed = await client.call('build_lab', { labId, settings: [{ deviceId: 'srv', ssids: [{ ssid: 'X' }] }] })
    expect(failed.isError).toBe(true)
    expect(failed.structured.failures).toEqual([expect.objectContaining({ section: 'settings', index: 0 })])
  })
})
