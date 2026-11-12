import { describe, expect, it } from 'vitest'
import type { Device } from '../../domain'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { FactoryReset } from '../core/FactoryReset'
import { RouterCli, testL3Switch } from './testRouterCli'

/** What the router set configures, without the core's duplex / speed fields. */
function routerState(device: Device): unknown {
  return {
    ports: device.ports.map((port) =>
      port.role === 'routed' ? { id: port.id, adminUp: port.adminUp, l3: port.l3, subInterfaces: port.subInterfaces, serial: port.serial } : { id: port.id },
    ),
    svis: device.switching?.svis,
    routing: device.routing,
    services: device.services,
  }
}

function configuredRouter(withRoutes = true): RouterCli {
  const cli = new RouterCli()
  const routes = withRoutes
    ? ['ip route 0.0.0.0 0.0.0.0 g0/1', 'ip route 10.2.0.0 255.255.0.0 10.1.1.2', 'ip route 10.3.0.0 255.255.0.0 s0/0/0 10.1.1.2 120']
    : []
  cli.configure(
    'hostname R1',
    'enable secret class',
    'no ip domain-lookup',
    'ip dhcp excluded-address 192.168.10.1 192.168.10.9',
    'ip dhcp excluded-address 192.168.20.1',
    'ip dhcp pool VLAN10',
    'network 192.168.10.0 255.255.255.0',
    'default-router 192.168.10.1',
    'dns-server 8.8.8.8 8.8.4.4',
    'ip dhcp pool EMPTY',
    'exit',
    'ip name-server 8.8.8.8',
    'ip dns server',
    'ip host intranet.local 192.168.10.50',
    'interface g0/0',
    'no shutdown',
    'interface g0/0.10',
    'encapsulation dot1Q 10',
    'description Staff',
    'ip address 192.168.10.1 255.255.255.0',
    'ip helper-address 10.0.0.5',
    'interface g0/0.99',
    'encapsulation dot1Q 99 native',
    'ip address 192.168.99.1 255.255.255.0',
    'shutdown',
    'interface g0/1',
    'ip address dhcp',
    'no shutdown',
    'interface s0/0/0',
    'ip address 10.1.1.1 255.255.255.252',
    'clock rate 64000',
    'no shutdown',
    'exit',
    ...routes,
    'line con 0',
    'password cisco',
    'login',
    'end',
  )
  return cli
}

/**
 * Replays what the core does not carry over yet (reported to the coordinator): a sub-interface description
 * (written before `encapsulation` creates the sub-interface), and global lines right after a sub-mode block
 * whose first word the sub-mode knows too (`ip route` after an interface, `no ip …` after a dhcp pool).
 */
function withCoreGaps(cli: RouterCli, replayed: Device): Device {
  const descriptions = DeviceInterfaces.list(cli.device).flatMap((iface) =>
    iface.kind === 'subInterface' && iface.sub.description !== undefined ? [`interface ${iface.id}`, ` description ${iface.sub.description}`, 'exit'] : [],
  )
  const globals = cli.config().filter((line) => line.startsWith('ip route ') || line.startsWith('no ip '))
  return cli.shell.replay(replayed, [...descriptions, ...globals].join('\n'))
}

describe('router CLI: running-config', () => {
  it('writes the router sections in IOS order', () => {
    const config = configuredRouter().config()
    const from = config.indexOf('ip dhcp excluded-address 192.168.10.1 192.168.10.9')
    const to = config.indexOf('line con 0')
    expect(config.slice(from, to)).toEqual([
      'ip dhcp excluded-address 192.168.10.1 192.168.10.9',
      'ip dhcp excluded-address 192.168.20.1',
      '!',
      'ip dhcp pool VLAN10',
      ' network 192.168.10.0 255.255.255.0',
      ' default-router 192.168.10.1',
      ' dns-server 8.8.8.8 8.8.4.4',
      '!',
      'ip dhcp pool EMPTY',
      '!',
      'no ip domain-lookup',
      '!',
      'ip host intranet.local 192.168.10.50',
      'ip name-server 8.8.8.8',
      'ip dns server',
      '!',
      'interface GigabitEthernet0/0',
      ' no ip address',
      ' duplex auto',
      ' speed auto',
      '!',
      'interface GigabitEthernet0/0.10',
      ' description Staff',
      ' encapsulation dot1Q 10',
      ' ip address 192.168.10.1 255.255.255.0',
      ' ip helper-address 10.0.0.5',
      '!',
      'interface GigabitEthernet0/0.99',
      ' encapsulation dot1Q 99 native',
      ' ip address 192.168.99.1 255.255.255.0',
      ' shutdown',
      '!',
      'interface GigabitEthernet0/1',
      ' ip address dhcp',
      ' duplex auto',
      ' speed auto',
      '!',
      'interface Serial0/0/0',
      ' ip address 10.1.1.1 255.255.255.252',
      ' clock rate 64000',
      '!',
      'interface Serial0/0/1',
      ' no ip address',
      ' shutdown',
      '!',
      'ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/1',
      'ip route 10.2.0.0 255.255.0.0 10.1.1.2',
      'ip route 10.3.0.0 255.255.0.0 Serial0/0/0 10.1.1.2 120',
      '!',
    ])
  })

  it('replays its own running-config to the same device (round trip)', () => {
    const cli = configuredRouter()
    const config = cli.config()
    const replayed = cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), config.join('\n'))
    expect(routerState(withCoreGaps(cli, replayed))).toEqual(routerState(cli.device))
    expect(cli.shell.runningConfig(withCoreGaps(cli, replayed))).toEqual(config)
  })

  it('round-trips an L3 switch with ip routing and SVI gateways', () => {
    const cli = new RouterCli(testL3Switch())
    cli.configure('ip routing', 'interface vlan 10', 'ip address 10.10.0.1 255.255.255.0', 'ip helper-address 10.0.0.5', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.10.0.254')
    const config = cli.config()
    expect(config).toEqual(expect.arrayContaining(['ip routing', 'interface Vlan10', ' ip address 10.10.0.1 255.255.255.0', ' ip helper-address 10.0.0.5']))
    const replayed = withCoreGaps(cli, cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), config.join('\n')))
    expect(routerState(replayed)).toEqual(routerState(cli.device))
    expect(cli.shell.runningConfig(replayed)).toEqual(config)
  })

  // IOS: a sub-mode line invalid past its first word runs in global config (CliRunner): running-config
  // writes `ip route` right after the last interface block and `no ip …` right after an `ip dhcp pool`.
  it('replays global lines that follow an interface or dhcp pool block without help', () => {
    const cli = configuredRouter()
    const replayed = cli.shell.replay(FactoryReset.interfacesUp(FactoryReset.of(cli.device)), cli.config().join('\n'))
    expect(replayed.routing?.staticRoutes).toEqual(cli.device.routing?.staticRoutes)
    expect(replayed.features?.management?.domainLookup).toBe(cli.device.features?.management?.domainLookup)
  })
})

describe('router CLI: saving and management (core commands with the router set)', () => {
  it('saves with copy run start and write memory, and reload brings the saved config back', () => {
    const cli = configuredRouter(false)
    // Without what the core does not replay yet (see withCoreGaps).
    cli.typeAll('configure terminal', 'interface g0/0.10', 'no description', 'end')
    cli.type('copy running-config startup-config')
    expect(cli.prompt).toBe('Destination filename [startup-config]? ')
    expect(cli.type('')).toEqual(['Building configuration...', '[OK]'])
    expect(cli.device.features?.management?.startupConfig).toBe(cli.config().join('\n'))
    cli.typeAll('configure terminal', 'ip dhcp pool EXTRA', 'network 172.16.0.0 255.255.0.0', 'end')
    expect(cli.type('write memory')).toEqual(['Building configuration...', '[OK]'])
    const saved = cli.device
    cli.typeAll('reload', '')
    expect(cli.last.reloaded).toBe(true)
    expect(routerState(cli.device)).toEqual(routerState(saved))
  })

  it('keeps hostname, enable secret and the console password', () => {
    const cli = configuredRouter()
    expect(cli.prompt).toBe('R1#')
    const config = cli.config()
    expect(config).toContain('hostname R1')
    expect(config.some((line) => line.startsWith('enable secret 5 '))).toBe(true)
    expect(config).toEqual(expect.arrayContaining(['line con 0', ' password cisco', ' login']))
    cli.typeAll('disable', 'enable')
    expect(cli.prompt).toBe('Password: ')
    cli.type('class')
    expect(cli.prompt).toBe('R1#')
  })
})
