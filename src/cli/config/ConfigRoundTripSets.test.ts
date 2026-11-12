// Round trip of the switch (C2) and router (C3) config lines through the export: each block runs only
// while its command set exists (wave 4.1 builds them in parallel; import.meta.glob finds none until then).
import { describe, expect, it } from 'vitest'
import type { Device } from '../../domain'
import type { CliCommandSet } from '../contract'
import { CliShell } from '../core/CliShell'
import { CliDriver, testRouter, testSwitch } from '../core/testCli'
import { ConfigRoundTrip } from './ConfigRoundTrip'
import { rebuildThroughLabExport, sampleL3Switch } from './configFixtures'

interface SetModule {
  readonly switchCommandSet?: unknown
  readonly createSwitchCommandSet?: (options: { readonly ipAddress?: boolean }) => unknown
  readonly routerCommandSet?: unknown
}

function isCommandSet(value: unknown): value is CliCommandSet {
  return typeof value === 'object' && value !== null && 'commands' in value && Array.isArray(value.commands)
}

const modules = Object.values(import.meta.glob<SetModule>(['../switch/index.ts', '../router/index.ts'], { eager: true }))
const switchSet = modules.map((module) => module.switchCommandSet).find(isCommandSet)
const routerSet = modules.map((module) => module.routerCommandSet).find(isCommandSet)
/** Both sets: the router set handles `ip address` everywhere, so the switch set leaves it out. */
const bothSets = [modules.map((module) => module.createSwitchCommandSet?.({ ipAddress: false })).find(isCommandSet), routerSet].filter(isCommandSet)

/**
 * Former core bug K4, fixed in pack 5.2 (src/cli/core/CliRunner.ts execute): a sub-mode now retries in
 * global config any line it rejects, like IOS, so `ip route …` right after an `interface` block replays.
 */
const roundTripWithRoutes = it

function configured(sets: readonly CliCommandSet[], device: Device, ...lines: readonly string[]): Device {
  const cli = new CliDriver(device, sets)
  cli.typeAll('enable', 'configure terminal', ...lines, 'end')
  return cli.device
}

function expectRoundTrip(sets: readonly CliCommandSet[], device: Device): void {
  const shell = new CliShell(sets)
  expect(ConfigRoundTrip.differences(ConfigRoundTrip.blank(device), device).length).toBeGreaterThan(0)
  expect(ConfigRoundTrip.differences(device, new ConfigRoundTrip(shell).rebuild(device))).toEqual([])
}

/** Router on a stick: sub-interfaces, helper, serial clock rate, static routes, DHCP pool and exclusion. */
function routerOnAStick(sets: readonly CliCommandSet[]): Device {
  return configured(
    sets,
    testRouter(),
    'hostname R1',
    'ip dhcp excluded-address 192.168.10.1 192.168.10.10',
    'ip dhcp pool SALES',
    'network 192.168.10.0 255.255.255.0',
    'default-router 192.168.10.1',
    'dns-server 8.8.8.8',
    'exit',
    'interface g0/0',
    'no shutdown',
    'interface g0/0.10',
    'encapsulation dot1Q 10',
    'ip address 192.168.10.1 255.255.255.0',
    'interface g0/0.20',
    'encapsulation dot1Q 20',
    'ip address 192.168.20.1 255.255.255.0',
    'ip helper-address 10.0.0.2',
    'interface g0/1',
    'ip address 10.0.0.1 255.255.255.252',
    'no shutdown',
    'interface se0/0/0',
    'ip address 172.16.0.1 255.255.255.252',
    'clock rate 64000',
    'no shutdown',
    'exit',
    'ip route 0.0.0.0 0.0.0.0 10.0.0.2',
    'ip route 172.31.0.0 255.255.0.0 Serial0/0/0',
  )
}

/** Access switch: named and unnamed VLANs, access ports, a trunk, the management SVI and gateway. */
function accessSwitch(sets: readonly CliCommandSet[]): Device {
  return configured(
    sets,
    testSwitch(),
    'hostname S1',
    'vlan 10',
    'name SALES',
    'vlan 20',
    'exit',
    'interface fa0/1',
    'switchport mode access',
    'switchport access vlan 10',
    'interface fa0/2',
    'switchport access vlan 20',
    'interface g0/1',
    'switchport mode trunk',
    'switchport trunk native vlan 99',
    'switchport trunk allowed vlan 10,20,99',
    'interface vlan 1',
    'ip address 192.168.1.2 255.255.255.0',
    'no shutdown',
    'exit',
    'ip default-gateway 192.168.1.1',
  )
}

/** L3 switch: ip routing, a gateway SVI with a helper, a routed port, a default route. */
function coreSwitch(sets: readonly CliCommandSet[]): Device {
  return configured(
    sets,
    sampleL3Switch(),
    'ip routing',
    'vlan 10',
    'exit',
    'interface vlan 10',
    'ip address 192.168.10.1 255.255.255.0',
    'ip helper-address 192.168.1.5',
    'no shutdown',
    'interface g1/0/24',
    'no switchport',
    'ip address 10.0.1.1 255.255.255.252',
    'exit',
    'ip route 0.0.0.0 0.0.0.0 10.0.1.2',
  )
}

describe.skipIf(routerSet === undefined)('config round trip: router command set', () => {
  const sets = [routerSet].filter(isCommandSet)

  roundTripWithRoutes('rebuilds a router on a stick from its exported config', () => {
    expectRoundTrip(sets, routerOnAStick(sets))
  })
})

describe.skipIf(switchSet === undefined)('config round trip: switch command set', () => {
  const sets = [switchSet].filter(isCommandSet)

  it('rebuilds an access switch with its VLAN database from its exported config', () => {
    expectRoundTrip(sets, accessSwitch(sets))
  })
})

describe.skipIf(bothSets.length < 2)('config round trip: switch and router command sets', () => {
  roundTripWithRoutes('rebuilds an L3 switch from its exported config', () => {
    expectRoundTrip(bothSets, coreSwitch(bothSets))
  })

  roundTripWithRoutes('rebuilds every device of a whole-lab export', () => {
    const devices = [routerOnAStick(bothSets), accessSwitch(bothSets), coreSwitch(bothSets)]
    const rebuilt = rebuildThroughLabExport(new CliShell(bothSets), devices)
    devices.forEach((device, index) => {
      const copy = rebuilt[index]
      if (copy === undefined) throw new Error('missing device')
      expect(ConfigRoundTrip.differences(device, copy)).toEqual([])
    })
  })
})
