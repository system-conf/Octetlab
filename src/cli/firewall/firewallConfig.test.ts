import { describe, expect, it } from 'vitest'
import type { Device, DeviceFeatures } from '../../domain'
import { CLI_COMMAND_SETS } from '../commandSets'
import { CliShell } from '../core/CliShell'
import { CliDriver, testRouter } from '../core/testCli'
import { FirewallCli, THREE_LEGS } from './firewallTestCli'

const INVALID = "% Invalid input detected at '^' marker."

const FULL = [
  ...THREE_LEGS,
  'same-security-traffic permit inter-interface',
  'object network WEB',
  'host 172.16.0.10',
  'nat (dmz,outside) static 203.0.113.10',
  'object network LAN',
  'subnet 10.0.0.0 255.255.255.0',
  'nat (inside,outside) dynamic interface',
  'exit',
  'access-list OUTSIDE_IN extended permit tcp any host 172.16.0.10 eq 80',
  'access-list OUTSIDE_IN extended permit icmp any 172.16.0.0 255.255.255.0 echo-reply',
  'access-group OUTSIDE_IN in interface outside',
  'route outside 0.0.0.0 0.0.0.0 203.0.113.1',
  'timeout conn 2:00:00',
  'timeout icmp 0:00:10',
  'no inspect icmp',
]

/** Replay leaves an empty `management` block (core behaviour, not this set's); compare the rest. */
function withoutManagement(device: Device): DeviceFeatures {
  const features: DeviceFeatures = { ...device.features }
  delete features.management
  return features
}

function portL3(cli: FirewallCli, index: number) {
  const port = cli.device.ports[index]
  return port?.role === 'routed' ? port.l3 : undefined
}

describe('firewall CLI: interfaces', () => {
  it('uses the Firewall prompt and prints the default level when a nameif is set', () => {
    const cli = new FirewallCli()
    expect(cli.prompt).toBe('Firewall>')
    cli.configure('interface g0/1')
    expect(cli.type('nameif inside')).toEqual(['INFO: Security level for "inside" set to 100 by default.'])
    cli.type('interface g0/0')
    expect(cli.type('nameif outside')).toEqual(['INFO: Security level for "outside" set to 0 by default.'])
    expect(portL3(cli, 1)?.features?.firewall).toEqual({ nameif: 'inside', securityLevel: 100 })
    expect(portL3(cli, 0)?.features?.firewall).toEqual({ nameif: 'outside', securityLevel: 0 })
  })

  it('security-level, renaming and no forms; factory state is an absent key', () => {
    const cli = new FirewallCli()
    cli.configure('interface g0/2', 'nameif dmz', 'security-level 50')
    expect(cli.type('nameif dmz2')).toEqual([])
    expect(portL3(cli, 2)?.features?.firewall).toEqual({ nameif: 'dmz2', securityLevel: 50 })
    cli.type('no security-level')
    expect(portL3(cli, 2)?.features?.firewall).toEqual({ nameif: 'dmz2', securityLevel: 0 })
    cli.type('no nameif')
    expect(portL3(cli, 2)?.features).toBeUndefined()
  })

  it('rejects a used name, a level without nameif and an out-of-range level', () => {
    const cli = new FirewallCli()
    cli.configure('interface g0/1', 'nameif inside', 'interface g0/2')
    expect(cli.type('nameif inside')).toEqual(['% Name "inside" is used by another interface'])
    expect(cli.type('security-level 10')).toEqual(['% Configure nameif before security-level'])
    expect(cli.type('nameif 1bad')).toEqual(['% Invalid interface name "1bad"'])
    cli.type('nameif dmz')
    expect(cli.type('security-level 101').at(-2)).toBe(INVALID)
  })
})

describe('firewall CLI: global configuration', () => {
  it('stores settings, objects, mapped NAT rows, ACLs, bindings and routes', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    expect(cli.device.features?.firewall).toEqual({
      sameSecurityInterInterface: true,
      inspectIcmp: false,
      timeouts: { tcp: 7200, icmp: 10 },
      objects: [
        { name: 'WEB', address: { kind: 'host', address: '172.16.0.10' }, nat: { realInterface: 'dmz', mappedInterface: 'outside', type: 'static', mapped: { kind: 'address', address: '203.0.113.10' } } },
        { name: 'LAN', address: { kind: 'subnet', address: '10.0.0.0', mask: '255.255.255.0' }, nat: { realInterface: 'inside', mappedInterface: 'outside', type: 'dynamic', mapped: { kind: 'interface' } } },
      ],
    })
    expect(cli.device.features?.nat).toEqual({
      pools: [],
      statics: [{ kind: 'static', insideLocal: '172.16.0.10', insideGlobal: '203.0.113.10' }],
      dynamics: [{ kind: 'dynamic', aclName: 'OBJ_NAT_LAN', target: { kind: 'interface', interfaceId: 'Gi0/0' }, overload: true }],
    })
    expect(cli.device.features?.accessLists?.lists).toEqual([
      { name: 'OBJ_NAT_LAN', type: 'standard', entries: [{ kind: 'standard', action: 'permit', source: { address: '10.0.0.0', wildcard: '0.0.0.255' }, seq: 10 }] },
      {
        name: 'OUTSIDE_IN',
        type: 'extended',
        entries: [
          { kind: 'extended', action: 'permit', protocol: 'tcp', source: { address: '0.0.0.0', wildcard: '255.255.255.255' }, destination: { address: '172.16.0.10', wildcard: '0.0.0.0' }, destinationPort: { op: 'eq', port: 80 }, seq: 10 },
          { kind: 'extended', action: 'permit', protocol: 'icmp', source: { address: '0.0.0.0', wildcard: '255.255.255.255' }, destination: { address: '172.16.0.0', wildcard: '0.0.0.255' }, icmpType: 0, seq: 20 },
        ],
      },
    ])
    expect(portL3(cli, 0)?.features).toEqual({ firewall: { nameif: 'outside', securityLevel: 0 }, accessGroups: { in: 'OUTSIDE_IN' }, natRole: 'outside' })
    expect(portL3(cli, 1)?.features?.natRole).toBe('inside')
    expect(portL3(cli, 2)?.features?.natRole).toBe('inside')
    expect(cli.device.routing?.staticRoutes).toEqual([{ prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop: '203.0.113.1', exitInterfaceId: 'Gi0/0' }])
  })

  it('object network sub-mode: prompt, help header and exit', () => {
    const cli = new FirewallCli()
    cli.configure('object network WEB')
    expect(cli.prompt).toBe('Firewall(config-network-object)#')
    expect(cli.help('')[0]).toBe('Network object configuration commands:')
    cli.type('exit')
    expect(cli.prompt).toBe('Firewall(config)#')
  })

  it('no forms withdraw what they created and restore absent keys', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    cli.typeAll(
      'no same-security-traffic permit inter-interface',
      'no timeout conn',
      'no timeout icmp',
      'inspect icmp',
      'no access-group OUTSIDE_IN in interface outside',
      'no access-list OUTSIDE_IN',
      'no route outside 0.0.0.0 0.0.0.0 203.0.113.1',
      'object network LAN',
      'no nat',
      'exit',
      'no object network WEB',
      'no object network LAN',
    )
    expect(cli.device.features?.firewall).toBeUndefined()
    expect(cli.device.features?.nat).toBeUndefined()
    expect(cli.device.features?.accessLists).toBeUndefined()
    expect(cli.device.routing?.staticRoutes).toEqual([])
    expect(portL3(cli, 0)?.features).toEqual({ firewall: { nameif: 'outside', securityLevel: 0 } })
    expect(portL3(cli, 1)?.features).toEqual({ firewall: { nameif: 'inside', securityLevel: 100 } })
  })

  it('a changed object address moves its NAT rows', () => {
    const cli = new FirewallCli()
    cli.configure(...THREE_LEGS, 'object network LAN', 'subnet 10.0.0.0 255.255.255.0', 'nat (inside,outside) dynamic 203.0.113.9', 'subnet 10.0.0.0 255.255.0.0')
    expect(cli.device.features?.accessLists?.lists[0]?.entries).toEqual([{ kind: 'standard', action: 'permit', source: { address: '10.0.0.0', wildcard: '0.0.255.255' }, seq: 10 }])
    expect(cli.device.features?.nat?.pools).toEqual([{ name: 'OBJ_NAT_LAN', start: '203.0.113.9', end: '203.0.113.9', netmask: '255.255.255.255' }])
    expect(cli.device.features?.nat?.dynamics).toEqual([{ kind: 'dynamic', aclName: 'OBJ_NAT_LAN', target: { kind: 'pool', poolName: 'OBJ_NAT_LAN' }, overload: true }])
  })

  it('prints lab errors for bad input', () => {
    const cli = new FirewallCli()
    cli.configure(...THREE_LEGS)
    expect(cli.type('access-group X in interface nowhere')).toEqual(['% Interface name "nowhere" not found'])
    expect(cli.type('route nowhere 0.0.0.0 0.0.0.0 203.0.113.1')).toEqual(['% Interface name "nowhere" not found'])
    expect(cli.type('route outside 10.0.0.1 255.255.255.0 203.0.113.1')).toEqual(['% Inconsistent address and mask'])
    expect(cli.type('timeout conn 90')).toEqual(['% Invalid timeout "90", use h:mm:ss'])
    expect(cli.type('access-list A extended permit ip 10.0.0.0 255.0.255.0 any')).toEqual(['% Invalid netmask 255.0.255.0'])
    expect(cli.type('access-list A extended permit bogus any any')).toEqual(['% Invalid access list entry (protocol)'])
    cli.type('object network SRV')
    expect(cli.type('subnet 10.0.0.1 255.255.255.0')).toEqual(["% IP address,mask 10.0.0.1,255.255.255.0 doesn't pair"])
    expect(cli.type('nat (inside,outside) dynamic interface')).toEqual(['% Object SRV has no host or subnet'])
    cli.type('subnet 10.0.0.0 255.255.255.0')
    expect(cli.type('nat (inside,outside) static 203.0.113.20')).toEqual(['% Static NAT of a subnet object is not supported in this lab; use a host object'])
    expect(cli.type('nat inside,outside dynamic interface')).toEqual(['% Use the form (real_ifc,mapped_ifc)'])
    expect(cli.type('nat (inside,wan) dynamic interface')).toEqual(['% Interface name "wan" not found'])
    expect(cli.device.features?.nat).toBeUndefined()
  })
})

describe('firewall CLI: running-config', () => {
  it('writes the interface lines at slot 55 and the global sections in contract order', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    const config = cli.config()
    const outside = config.indexOf('interface GigabitEthernet0/0')
    expect(config.slice(outside, outside + 5)).toEqual([
      'interface GigabitEthernet0/0',
      ' ip address 203.0.113.2 255.255.255.252',
      ' ip access-group OUTSIDE_IN in',
      ' nameif outside',
      ' security-level 0',
    ])
    const from = config.indexOf('same-security-traffic permit inter-interface')
    expect(config.slice(from, from + 14)).toEqual([
      'same-security-traffic permit inter-interface',
      '!',
      'object network WEB',
      ' host 172.16.0.10',
      '!',
      'object network LAN',
      ' subnet 10.0.0.0 255.255.255.0',
      '!',
      'access-group OUTSIDE_IN in interface outside',
      '!',
      'timeout conn 2:00:00',
      'timeout icmp 0:00:10',
      'no inspect icmp',
      '!',
    ])
    const nat = config.indexOf(' nat (dmz,outside) static 203.0.113.10')
    expect(config.slice(nat - 1, nat + 5)).toEqual([
      'object network WEB',
      ' nat (dmz,outside) static 203.0.113.10',
      '!',
      'object network LAN',
      ' nat (inside,outside) dynamic interface',
      '!',
    ])
    expect(nat).toBeGreaterThan(config.indexOf('ip access-list extended OUTSIDE_IN'))
  })

  it('replays its own running-config to the same device (round trip through CliShell.replay)', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    const replayed = cli.replayed()
    expect(withoutManagement(replayed)).toEqual(withoutManagement(cli.device))
    expect(replayed.ports).toEqual(cli.device.ports)
    expect(replayed.routing).toEqual(cli.device.routing)
    expect(cli.shell.runningConfig(replayed)).toEqual(cli.config())
  })

  it('writes no `ip nat` line on a firewall, so every written line replays without an error', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    const config = cli.config()
    expect(config.filter((line) => line.trim().startsWith('ip nat'))).toEqual([])
    const replay = new FirewallCli(cli.replayed())
    replay.typeAll('enable', 'configure terminal')
    // Core version / service lines are the core's (`no service timestamps …` is not accepted by core: reported).
    const errors = config.filter((line) => line !== '!' && line !== 'end' && !line.startsWith('version') && !line.startsWith('service') && !line.startsWith('no service') && !line.startsWith('hostname'))
    for (const line of errors) expect(replay.all(line.trim()).filter((output) => output.startsWith('%')), line).toEqual([])
  })

  it('router NAT output is unchanged', () => {
    const router = new CliDriver(testRouter(), CLI_COMMAND_SETS)
    router.typeAll('enable', 'configure terminal', 'interface g0/0', 'ip nat inside', 'exit', 'ip nat inside source static 192.168.1.50 203.0.113.50')
    const config = router.shell.runningConfig(router.device)
    expect(config).toContain(' ip nat inside')
    expect(config).toContain('ip nat inside source static 192.168.1.50 203.0.113.50')
  })

  it('replays an object without NAT and an empty object', () => {
    const cli = new FirewallCli()
    cli.configure(...THREE_LEGS, 'object network EMPTY', 'object network HOST', 'host 10.0.0.5', 'exit', 'same-security-traffic permit intra-interface')
    expect(withoutManagement(cli.replayed())).toEqual(withoutManagement(cli.device))
  })

  it('startup-config: write memory and reload keep the firewall configuration', () => {
    const cli = new FirewallCli()
    cli.configure(...FULL)
    cli.typeAll('end', 'write memory')
    const startup = cli.device.features?.management?.startupConfig ?? ''
    expect(startup).toContain('nat (inside,outside) dynamic interface')
    expect(cli.shell.replay(cli.device, startup).features?.firewall).toEqual(cli.device.features?.firewall)
  })
})

describe('firewall CLI: other device kinds', () => {
  it('constructs the shell with every set without handler clashes', () => {
    expect(() => new CliShell(CLI_COMMAND_SETS)).not.toThrow()
  })

  it('routers do not see the firewall commands', () => {
    const router = new CliDriver(testRouter(), CLI_COMMAND_SETS)
    router.typeAll('enable', 'configure terminal', 'interface g0/0')
    expect(router.type('nameif inside').at(-2)).toBe(INVALID)
    router.type('exit')
    expect(router.type('same-security-traffic permit inter-interface').at(-2)).toBe(INVALID)
    expect(router.type('access-list 10 permit any')).toEqual([])
    expect(router.type('access-list NAMED extended permit ip any any').at(-2)).toBe(INVALID)
    router.type('end')
    expect(router.type('show conn').at(-2)).toBe(INVALID)
    expect(router.help('show na')).toEqual(['% Unrecognized command'])
  })
})
