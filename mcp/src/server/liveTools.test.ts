import { describe, expect, it } from 'vitest'
import type { LiveEvent } from '../live/LiveEvent'
import { McpTestClient, TEST_APP_ORIGIN } from './McpTestClient'

const CAFE = {
  title: 'Cafe',
  devices: [
    { ref: 'net', modelId: 'internetCloud' },
    { ref: 'r1', modelId: 'router3Port', name: 'Cafe Router' },
    { ref: 'sw', modelId: 'switch8' },
    { ref: 'pc', modelId: 'pc', name: 'Office PC' },
    { ref: 'pos', modelId: 'pos', name: 'Till' },
  ],
  links: [
    { a: 'r1', b: 'sw', portA: 'Gi0/1' },
    { a: 'pc', b: 'sw' },
    { a: 'pos', b: 'sw' },
  ],
  hosts: [
    { deviceId: 'pc', mode: 'static', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1' },
    { deviceId: 'pos', mode: 'static', ip: '192.168.10.20', mask: '255.255.255.0', gateway: '192.168.10.1' },
  ],
  cli: [{ deviceRef: 'r1', config: 'interface Gi0/1\n ip address 192.168.10.1 255.255.255.0\n no shutdown' }],
}

async function events(client: McpTestClient, labId: string): Promise<LiveEvent[]> {
  return (await client.rooms.room(labId).snapshot())?.events ?? []
}

describe('live labs through the MCP tools', () => {
  it('gives every new lab a live link and logs exactly one event per mutating call', async () => {
    const client = new McpTestClient()
    const created = await client.ok('create_lab', { title: 'Office' })
    const labId = String(created.structured.labId)
    const liveUrl = `${TEST_APP_ORIGIN}/live/${labId}`
    expect(created.structured.liveUrl).toBe(liveUrl)
    expect(created.text).toContain(`Watch it live: ${liveUrl}`)

    const added = await client.ok('add_device', { labId, modelId: 'pc', name: 'Office PC' })
    expect(added.structured.liveUrl).toBe(liveUrl)
    await client.ok('add_device', { labId, modelId: 'switch8' })
    await client.ok('connect', { labId, deviceA: 'pc1', deviceB: 'switch1' })
    await client.ok('configure_host', { labId, deviceId: 'pc1', mode: 'static', ip: '10.0.0.5', mask: '255.255.255.0' })
    await client.ok('set_power', { labId, deviceId: 'switch1', on: true })
    await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ping 10.0.0.9' })
    await client.ok('disconnect', { labId, linkId: 'link1' })
    await client.ok('remove_device', { labId, deviceId: 'switch1' })
    const failed = await client.call('add_device', { labId, modelId: 'toaster' })
    expect(failed.isError).toBe(true)
    expect((await client.ok('get_lab', { labId })).structured.liveUrl).toBe(liveUrl)

    const log = await events(client, labId)
    expect(log.map((event) => [event.tool, event.summary, event.version])).toEqual([
      ['create_lab', 'Created the empty lab "Office".', 1],
      ['add_device', 'Added Office PC (pc).', 2],
      ['add_device', 'Added Switch 1 (switch8).', 3],
      ['connect', 'Connected Office PC eth0 to Switch 1 Fa0/1.', 4],
      ['configure_host', 'Configured Office PC eth0: 10.0.0.5 255.255.255.0.', 5],
      ['set_power', 'Turned Switch 1 on.', 5],
      ['run_command', 'Ran "ping 10.0.0.9" on Office PC.', 5],
      ['disconnect', 'Removed the cable between Office PC and Switch 1.', 6],
      ['remove_device', 'Removed Switch 1.', 7],
    ])
    expect(log[3]).toMatchObject({ deviceIds: ['pc1', 'switch1'], linkIds: ['link1'], actor: 'assistant' })
    const ping = log[6]?.output
    expect(ping).toMatchObject({ deviceId: 'pc1', command: 'ping 10.0.0.9' })
    expect(ping?.lines.length).toBeGreaterThan(1)
  })

  it('builds a cafe in one call with one event and a working network', async () => {
    const client = new McpTestClient()
    const built = await client.ok('build_lab', CAFE)
    const labId = String(built.structured.labId)
    expect(built.text).toContain('Built 5 devices, 3 cables, configured 2 hosts and 1 router.')
    expect(built.text).toContain(`Watch it live: ${TEST_APP_ORIGIN}/live/${labId}`)
    expect(built.structured.devices).toEqual([
      { ref: 'net', deviceId: expect.any(String), name: expect.any(String), modelId: 'internetCloud' },
      { ref: 'r1', deviceId: 'router1', name: 'Cafe Router', modelId: 'router3Port' },
      { ref: 'sw', deviceId: 'switch1', name: expect.any(String), modelId: 'switch8' },
      { ref: 'pc', deviceId: 'pc1', name: 'Office PC', modelId: 'pc' },
      { ref: 'pos', deviceId: expect.any(String), name: 'Till', modelId: 'pos' },
    ])
    const log = await events(client, labId)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ tool: 'build_lab', version: 1, linkIds: ['link1', 'link2', 'link3'] })
    expect(log[0]?.deviceIds).toHaveLength(5)

    const ping = await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ping 192.168.10.1' })
    expect(ping.text).toContain('Reply from 192.168.10.1')

    const more = await client.ok('build_lab', { labId, devices: [{ ref: 'pc2', modelId: 'pc' }], links: [{ a: 'pc2', b: 'switch1' }] })
    expect(more.text).toContain('Built 1 device and 1 cable.')
    expect(more.text).not.toContain('Watch it live')
    expect((await events(client, labId)).at(-1)).toMatchObject({ tool: 'build_lab', version: 2 })
  })

  it('saves nothing when a step fails and lists every failed step', async () => {
    const client = new McpTestClient()
    const broken = await client.call('build_lab', {
      devices: [{ ref: 'r1', modelId: 'router3Port' }, { ref: 'x', modelId: 'toaster' }, { ref: 'r1', modelId: 'pc' }],
      links: [{ a: 'r1', b: 'x' }],
      cli: [{ deviceRef: 'r1', config: 'interface Gi0/0\n ip adress 1.2.3.4' }],
    })
    expect(broken.isError).toBe(true)
    expect(broken.text).toContain('build_lab changed nothing: 4 step(s) failed')
    const failures = broken.structured.failures as { section: string; index: number }[]
    expect(failures.map((failure) => `${failure.section}[${failure.index}]`)).toEqual(['devices[1]', 'devices[2]', 'links[0]', 'cli[0]'])

    const labId = String((await client.ok('create_lab', {})).structured.labId)
    const before = await client.rooms.room(labId).read()
    const failed = await client.call('build_lab', { labId, devices: [{ ref: 'pc', modelId: 'pc' }], hosts: [{ deviceId: 'pc', mode: 'static', ip: '10.0.0.0', mask: '255.255.255.0' }] })
    expect(failed.isError).toBe(true)
    expect(await client.rooms.room(labId).read()).toEqual(before)
    expect(await events(client, labId)).toHaveLength(1)
  })

  it('enforces the build limits and refuses an empty build', async () => {
    const client = new McpTestClient()
    const tooMany = await client.call('build_lab', { devices: Array.from({ length: 101 }, (_, index) => ({ ref: `d${index}`, modelId: 'pc' })) })
    expect(tooMany.isError).toBe(true)
    const tooManyLinks = await client.call('build_lab', { links: Array.from({ length: 201 }, () => ({ a: 'a', b: 'b' })) })
    expect(tooManyLinks.isError).toBe(true)
    const empty = await client.call('build_lab', { title: 'Nothing' })
    expect(empty).toMatchObject({ isError: true, structured: { error: 'validation' } })
  })
})
