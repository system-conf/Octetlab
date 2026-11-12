import { describe, expect, it } from 'vitest'
import { labShareLink } from '../../../src/lab/LabShareLink'
import { McpTestClient, TEST_APP_LAB_URL } from './McpTestClient'

const TOOL_NAMES = [
  'add_device',
  'apply_cli_config',
  'build_lab',
  'configure_host',
  'connect',
  'create_lab',
  'disconnect',
  'get_lab',
  'import_share_link',
  'list_device_models',
  'list_samples',
  'open_sample',
  'remove_device',
  'run_command',
  'set_power',
  'share_link',
]

async function smallLab(client: McpTestClient): Promise<string> {
  const created = await client.ok('create_lab', { title: 'Office' })
  const labId = String(created.structured.labId)
  for (const modelId of ['pc', 'switch8', 'router2Port']) await client.ok('add_device', { labId, modelId })
  await client.ok('connect', { labId, deviceA: 'pc1', deviceB: 'switch1' })
  await client.ok('connect', { labId, deviceA: 'switch1', deviceB: 'router1' })
  return labId
}

describe('Octetlab MCP server over HTTP', () => {
  it('initializes and lists every tool', async () => {
    const client = new McpTestClient()
    const init = await client.initialize()
    expect(init.serverInfo).toMatchObject({ name: 'octetlab' })
    const listed = await client.request('tools/list', {})
    const names = (listed.tools as { name: string }[]).map((tool) => tool.name).sort()
    expect(names).toEqual(TOOL_NAMES)
  })

  it('builds a lab, configures it, pings, breaks it and shares it', async () => {
    const client = new McpTestClient()
    const labId = await smallLab(client)

    const lab = await client.ok('get_lab', { labId })
    expect(lab.text).toContain('pc1 eth0')
    expect(lab.structured.links).toHaveLength(2)

    const config = await client.ok('apply_cli_config', {
      labId,
      deviceId: 'router1',
      config: 'interface Gi0/0\n ip address 192.168.1.1 255.255.255.0\n no shutdown\nend',
    })
    expect(config.structured.errors).toEqual([])
    expect(config.text).toContain('ip address 192.168.1.1 255.255.255.0')

    await client.ok('configure_host', { labId, deviceId: 'pc1', mode: 'static', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' })

    const ping = await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ping 192.168.1.1' })
    expect(ping.text).toContain('Reply from 192.168.1.1')

    const brief = await client.ok('run_command', { labId, deviceId: 'router1', command: 'show ip interface brief' })
    expect(brief.text).toMatch(/GigabitEthernet0\/0\s+192\.168\.1\.1/)

    const routerPing = await client.ok('run_command', { labId, deviceId: 'router1', command: 'ping 192.168.1.10' })
    expect(routerPing.text).toContain('Success rate is')
    expect(routerPing.text).not.toContain('Success rate is 0 percent')

    const broken = await client.ok('apply_cli_config', { labId, deviceId: 'router1', config: 'interface Gi0/0\n shutdown\n ip adress 1.2.3.4' })
    expect(broken.structured.errors).toHaveLength(1)
    const failed = await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ping 192.168.1.1' })
    expect(failed.text).not.toMatch(/Reply from 192\.168\.1\.1:/)
    expect(failed.text).toContain('Destination host unreachable')

    const share = await client.ok('share_link', { labId })
    const url = String(share.structured.url)
    expect(url.startsWith(`${TEST_APP_LAB_URL}#lab=`)).toBe(true)
    const decoded = labShareLink.decode(url.slice(url.indexOf('#')))
    const stored = await client.rooms.room(labId).read()
    expect(decoded?.ok).toBe(true)
    if (decoded?.ok !== true || stored === null) throw new Error('share link did not decode')
    expect(decoded.doc).toEqual(JSON.parse(stored.docText))

    const imported = await client.ok('import_share_link', { url })
    expect(imported.structured.labId).not.toBe(labId)
    const importedLab = await client.ok('get_lab', { labId: imported.structured.labId })
    const original = await client.ok('get_lab', { labId })
    expect(importedLab.structured.devices).toEqual(original.structured.devices)
  })

  it('gets a DHCP lease from the router and keeps it in the lab', async () => {
    const client = new McpTestClient()
    const labId = await smallLab(client)
    const config = await client.ok('apply_cli_config', {
      labId,
      deviceId: 'router1',
      config: ['interface Gi0/0', ' ip address 10.0.0.1 255.255.255.0', ' no shutdown', 'ip dhcp pool LAN', ' network 10.0.0.0 255.255.255.0', ' default-router 10.0.0.1'].join('\n'),
    })
    expect(config.text).toContain('ip dhcp pool LAN')
    expect(config.structured.errors).toEqual([])
    await client.ok('configure_host', { labId, deviceId: 'pc1', mode: 'dhcp' })
    const renew = await client.ok('run_command', { labId, deviceId: 'pc1', command: 'ipconfig /renew' })
    expect(renew.text).toContain('10.0.0.')
    expect(renew.structured.labChanged).toBe(true)
    const lab = await client.ok('get_lab', { labId })
    expect(lab.text).toMatch(/pc1 .*eth0 10\.0\.0\.\d+\/255\.255\.255\.0 \(dhcp\)/)
  })

  it('reports clear errors', async () => {
    const client = new McpTestClient()
    const labId = await smallLab(client)
    const missing = await client.call('get_lab', { labId: 'AAAAAAAAAAAAAAAAAAAAAA' })
    expect(missing).toMatchObject({ isError: true, structured: { error: 'notFound' } })
    const model = await client.call('add_device', { labId, modelId: 'toaster' })
    expect(model.text).toContain('list_device_models')
    const badId = await client.call('get_lab', { labId: 'nope' })
    expect(badId.isError).toBe(true)
    const full = await client.call('connect', { labId, deviceA: 'pc1', deviceB: 'router1' })
    expect(full).toMatchObject({ isError: true, structured: { error: 'refused' } })
    const host = await client.call('configure_host', { labId, deviceId: 'pc1', mode: 'static', ip: '192.168.1.0', mask: '255.255.255.0' })
    expect(host.text).toContain('network or broadcast')
    const switchHost = await client.call('configure_host', { labId, deviceId: 'switch1', mode: 'dhcp' })
    expect(switchHost.text).toContain('apply_cli_config')
  })

  it('opens a sample lab', async () => {
    const client = new McpTestClient()
    const samples = await client.ok('list_samples', {})
    const first = (samples.structured.samples as { sampleId: string }[])[0]
    if (first === undefined) throw new Error('no samples')
    const opened = await client.ok('open_sample', { sampleId: first.sampleId })
    const lab = await client.ok('get_lab', { labId: opened.structured.labId })
    expect((lab.structured.devices as unknown[]).length).toBeGreaterThan(0)
  })
})
