import { describe, expect, it } from 'vitest'
import { FactoryReset } from '../core/FactoryReset'
import { catalogDevice } from '../core/testCli'
import { NatCli } from './natTestCli'

const LAN = ['interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'ip nat inside', 'no shutdown', 'exit']
const WAN = ['interface g0/1', 'ip address 203.0.113.2 255.255.255.252', 'ip nat outside', 'no shutdown', 'exit']

function natRouter(...lines: readonly string[]): NatCli {
  const cli = new NatCli()
  cli.configure(...LAN, ...WAN, ...lines)
  return cli
}

describe('NAT CLI: configuration', () => {
  it('stores pools, static and dynamic rules and interface roles', () => {
    const cli = natRouter(
      'ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248',
      'ip nat pool PRE 198.51.100.1 198.51.100.6 prefix-length 29',
      'ip nat inside source list 1 interface g0/1 overload',
      'ip nat inside source list 2 pool PUB',
      'ip nat inside source static 192.168.1.50 203.0.113.50',
      'ip nat inside source static tcp 192.168.1.60 80 203.0.113.2 8080',
    )
    expect(cli.device.features?.nat).toEqual({
      pools: [
        { name: 'PUB', start: '203.0.113.9', end: '203.0.113.14', netmask: '255.255.255.248' },
        { name: 'PRE', start: '198.51.100.1', end: '198.51.100.6', netmask: '255.255.255.248' },
      ],
      dynamics: [
        { kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1' }, overload: true },
        { kind: 'dynamic', aclName: '2', target: { kind: 'pool', poolName: 'PUB' }, overload: false },
      ],
      statics: [
        { kind: 'static', insideLocal: '192.168.1.50', insideGlobal: '203.0.113.50' },
        { kind: 'static', protocol: 'tcp', insideLocal: '192.168.1.60', insideLocalPort: 80, insideGlobal: '203.0.113.2', insideGlobalPort: 8080 },
      ],
    })
    const roles = cli.device.ports.map((port) => (port.role === 'routed' ? port.l3.features?.natRole : undefined))
    expect(roles.slice(0, 2)).toEqual(['inside', 'outside'])
  })

  it('rejects bad pools and clashing statics with IOS errors', () => {
    const cli = natRouter()
    expect(cli.type('ip nat pool P 203.0.113.10 203.0.113.9 netmask 255.255.255.0')).toEqual(['%End address less than starting address'])
    expect(cli.type('ip nat pool P 203.0.113.1 203.0.114.9 netmask 255.255.255.0')).toEqual(['%Start and end addresses on different subnets'])
    cli.type('ip nat inside source static 192.168.1.50 203.0.113.50')
    expect(cli.type('ip nat inside source static 192.168.1.50 203.0.113.51')).toEqual(['% similar static entry (192.168.1.50 -> 203.0.113.50) already exists'])
    expect(cli.device.features?.nat?.pools).toEqual([])
  })

  it('no forms remove what they name and restore factory (absent) keys', () => {
    const cli = natRouter('ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248', 'ip nat inside source list 1 pool PUB overload')
    expect(cli.type('no ip nat pool PUB')).toEqual(['%Pool PUB in use, cannot destroy'])
    cli.typeAll('no ip nat inside source list 1 pool PUB overload', 'no ip nat pool PUB')
    expect(cli.type('no ip nat pool PUB')).toEqual(['%Pool PUB not found'])
    cli.typeAll('ip nat inside source static 192.168.1.50 203.0.113.50', 'no ip nat inside source static 192.168.1.50 203.0.113.50')
    expect(cli.device.features?.nat).toBeUndefined()
    cli.typeAll('interface g0/0', 'no ip nat outside')
    expect(cli.device.ports[0]?.role === 'routed' && cli.device.ports[0].l3.features?.natRole).toBe('inside')
    cli.type('no ip nat inside')
    expect(cli.device.ports[0]?.role === 'routed' && cli.device.ports[0].l3.features).toBeUndefined()
  })

  it('a global NAT line typed in interface mode runs in global config; a mistyped interface line keeps its own error', () => {
    const cli = natRouter('interface g0/0')
    const error = cli.type('ip nat insde')
    expect(error.at(-2)).toBe('% Invalid input detected at \'^\' marker.')
    expect(cli.prompt).toBe('Router(config-if)#')
    cli.type('ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248')
    expect(cli.prompt).toBe('Router(config)#')
    expect(cli.device.features?.nat?.pools).toHaveLength(1)
  })

  it('does not exist on L3 switches (IOS L3 switches have no NAT)', () => {
    const cli = new NatCli(catalogDevice('l3Switch24', 'l3', '00:D0:BA:00:00:03'))
    cli.configure('ip routing')
    expect(cli.type('ip nat pool P 203.0.113.9 203.0.113.14 netmask 255.255.255.248').at(-2)).toBe('% Invalid input detected at \'^\' marker.')
  })
})

describe('NAT CLI: running-config', () => {
  const lines = [
    'ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248',
    'ip nat inside source list 1 interface g0/1 overload',
    'ip nat inside source list 2 pool PUB',
    'ip nat inside source static 192.168.1.50 203.0.113.50',
    'ip nat inside source static udp 192.168.1.60 53 203.0.113.2 53',
    'ip route 0.0.0.0 0.0.0.0 203.0.113.1',
  ]

  it('writes interface roles in the interface blocks and the global lines before ip route', () => {
    const config = natRouter(...lines).config()
    const from = config.indexOf('interface GigabitEthernet0/0')
    expect(config.slice(from, from + 5)).toEqual(['interface GigabitEthernet0/0', ' ip address 192.168.1.1 255.255.255.0', ' ip nat inside', ' duplex auto', ' speed auto'])
    expect(config).toContain(' ip nat outside')
    const nat = config.indexOf('ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248')
    expect(config.slice(nat, nat + 7)).toEqual([
      'ip nat pool PUB 203.0.113.9 203.0.113.14 netmask 255.255.255.248',
      'ip nat inside source list 1 interface GigabitEthernet0/1 overload',
      'ip nat inside source list 2 pool PUB',
      'ip nat inside source static 192.168.1.50 203.0.113.50',
      'ip nat inside source static udp 192.168.1.60 53 203.0.113.2 53',
      '!',
      'ip route 0.0.0.0 0.0.0.0 203.0.113.1',
    ])
    expect(nat).toBeGreaterThan(config.lastIndexOf(' ip nat outside'))
  })

  it('replays its own running-config to the same device (round trip through CliShell.replay)', () => {
    const cli = natRouter(...lines)
    const config = cli.config()
    const replayed = cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), config.join('\n'))
    expect(replayed.features?.nat).toEqual(cli.device.features?.nat)
    expect(replayed.routing?.staticRoutes).toEqual(cli.device.routing?.staticRoutes)
    expect(cli.shell.runningConfig(replayed)).toEqual(config)
  })

  it('round-trips a dynamic rule on a sub-interface', () => {
    const cli = natRouter('interface g0/1.100', 'encapsulation dot1Q 100', 'ip address 198.51.100.2 255.255.255.0', 'ip nat outside', 'exit', 'ip nat inside source list 1 interface g0/1.100 overload')
    const config = cli.config()
    const replayed = cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), config.join('\n'))
    expect(replayed.features?.nat?.dynamics).toEqual([{ kind: 'dynamic', aclName: '1', target: { kind: 'interface', interfaceId: 'Gi0/1.100' }, overload: true }])
    expect(cli.shell.runningConfig(replayed)).toEqual(config)
  })
})
