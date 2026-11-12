import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../sim/createSimulation'
import type { NatTranslation } from '../../sim/contract/SecurityRuntime'
import { natInternetLab } from '../../sim/policy/nat/natTestLabs'
import { NatCli } from './natTestCli'
import { NatTranslationsView } from './NatTranslationsView'

const SETUP = [
  'interface g0/0',
  'ip address 192.168.1.1 255.255.255.0',
  'ip nat inside',
  'exit',
  'interface g0/1',
  'ip address 203.0.113.2 255.255.255.252',
  'ip nat outside',
  'exit',
  'ip nat pool PUB 203.0.113.8 203.0.113.15 netmask 255.255.255.248',
  'ip nat inside source list 1 interface g0/1 overload',
  'ip nat inside source list 2 pool PUB',
  'ip nat inside source static 192.168.1.50 203.0.113.50',
]

const PAT: NatTranslation = {
  protocol: 'tcp',
  insideLocal: { ip: '192.168.1.10', port: 49152 },
  insideGlobal: { ip: '203.0.113.2', port: 49152 },
  outsideLocal: { ip: '142.250.187.206', port: 80 },
  outsideGlobal: { ip: '142.250.187.206', port: 80 },
  origin: 'dynamic',
  createdAt: 1_000,
  lastUsedAt: 5_000,
  expiresAt: 86_405_000,
}

const ICMP: NatTranslation = {
  protocol: 'icmp',
  insideLocal: { ip: '192.168.1.11', port: 1 },
  insideGlobal: { ip: '203.0.113.2', port: 0 },
  outsideLocal: { ip: '8.8.8.8', port: 1 },
  outsideGlobal: { ip: '8.8.8.8', port: 1 },
  origin: 'dynamic',
  createdAt: 2_000,
  lastUsedAt: 2_000,
  expiresAt: 62_000,
}

const SIMPLE: NatTranslation = {
  protocol: 'any',
  insideLocal: { ip: '192.168.1.20' },
  insideGlobal: { ip: '203.0.113.9' },
  origin: 'dynamic',
  createdAt: 3_000,
  lastUsedAt: 3_000,
  expiresAt: 86_403_000,
}

function shown(): NatCli {
  const cli = new NatCli()
  cli.configure(...SETUP, 'end')
  cli.withTable([PAT, ICMP, SIMPLE], { hits: 12, misses: 3, expired: 1 })
  cli.now = 65_000
  return cli
}

describe('NAT CLI: show commands', () => {
  it('show ip nat translations: static rows first, expired rows hidden (golden)', () => {
    expect(shown().type('show ip nat translations')).toEqual([
      'Pro Inside global      Inside local       Outside local      Outside global',
      '--- 203.0.113.50       192.168.1.50       ---                ---',
      'tcp 203.0.113.2:49152  192.168.1.10:49152 142.250.187.206:80 142.250.187.206:80',
      '--- 203.0.113.9        192.168.1.20       ---                ---',
    ])
  })

  it('show ip nat translations verbose adds create / use times and flags (golden)', () => {
    expect(shown().type('show ip nat translations verbose')).toEqual([
      'Pro Inside global      Inside local       Outside local      Outside global',
      '--- 203.0.113.50       192.168.1.50       ---                ---',
      '        create 00:01:05, use 00:01:05, flags: static',
      'tcp 203.0.113.2:49152  192.168.1.10:49152 142.250.187.206:80 142.250.187.206:80',
      '        create 00:01:04, use 00:01:00, flags: extended',
      '--- 203.0.113.9        192.168.1.20       ---                ---',
      '        create 00:01:02, use 00:01:02, flags: none',
    ])
  })

  it('show ip nat statistics (golden)', () => {
    expect(shown().type('show ip nat statistics')).toEqual([
      'Total translations: 3 (1 static, 2 dynamic; 1 extended)',
      'Outside interfaces: GigabitEthernet0/1',
      'Inside interfaces: GigabitEthernet0/0',
      'Hits: 12  Misses: 3',
      'Expired translations: 2',
      'Dynamic mappings:',
      '-- Inside Source',
      'access-list 1 interface GigabitEthernet0/1 refcount 1',
      'access-list 2 pool PUB refcount 1',
      ' pool PUB: netmask 255.255.255.248',
      '        start 203.0.113.8 end 203.0.113.15',
      '        type generic, total addresses 6, allocated 1 (16%)',
    ])
  })

  it('prints nothing for an empty table and no mappings without NAT', () => {
    const cli = new NatCli()
    cli.type('enable')
    expect(cli.type('show ip nat translations')).toEqual([])
    expect(cli.type('show ip nat statistics')).toEqual([
      'Total translations: 0 (0 static, 0 dynamic; 0 extended)',
      'Outside interfaces:',
      'Inside interfaces:',
      'Hits: 0  Misses: 0',
      'Expired translations: 0',
      'Dynamic mappings:',
    ])
  })

  it('shows the table a real PAT ping left in the simulator', () => {
    const lab = natInternetLab({ pools: [], statics: [], dynamics: [{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1' }, overload: true }] })
    const engine = createSimulation(lab)
    engine.runUntilDone(engine.inject({ kind: 'ping', deviceId: 'pc1', targetIp: '8.8.8.8', count: 1, size: 32 }))
    const router = engine.network().devices.find((device) => device.id === 'router')
    if (router === undefined) throw new Error('no router')
    const [header, row] = NatTranslationsView.lines(router, engine.runtime('router'), engine.time, false)
    expect(header).toBe('Pro Inside global      Inside local       Outside local      Outside global')
    expect(row).toMatch(/^icmp 203\.0\.113\.2:\d+ +192\.168\.1\.10:\d+ +8\.8\.8\.8:\d+ +8\.8\.8\.8:\d+$/)
  })

  it('clear ip nat translation * asks the simulator to clear the table', () => {
    const cli = shown()
    cli.type('clear ip nat translation *')
    expect(cli.last.job).toEqual({ kind: 'clearTable', deviceId: 'r1', table: 'natTranslations' })
  })
})
