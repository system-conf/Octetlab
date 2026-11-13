// Firewall pack exercise 1: a phone shop in a shopping mall gets its line from the mall's network, where
// the other tenants sit too. The mall router routes the shop's LAN (192.168.50.0/24) to the shop's
// firewall, so the till reaches the mall's card payment server. A former technician bound a
// `permit ip any any` list inbound on the outside interface "so the answers come back"; since then any
// tenant can open connections into the shop. Solved when the till still reaches the payment server while
// the neighbour's PC reaches neither shop device: the stateful firewall lets the answers back on its own.
// Only the firewall is editable. Graded by SimSolveChecker; the oracle skips firewall labs.
import type { ExerciseDefinition } from '../../domain'
import { MASK_30, routedPort, routes, routeTo, staticHost } from '../design/deviceSetup'
import { LabBuilder } from '../design/labBuilder'
import { onlyEditable } from './exerciseLocks'
import { nameif } from './firewallSetup'
import { MALL_SHOP_FIREWALL } from './securityExerciseIndex'
import { ANY, accessGroup, accessLists } from './securitySetup'

export const PAYMENT_SERVER_ADDRESS = '10.20.0.10'
/** The list the former technician left on the outside interface. */
export const OPEN_LIST = 'OUTSIDE_IN'

function mallLab() {
  const { state, layout } = new LabBuilder(5301)
    .add('server', 'odemeSunucusu', { x: 200, y: 40 }, staticHost(PAYMENT_SERVER_ADDRESS, '10.20.0.1', []))
    .add(
      'router3Port',
      'avmRouter',
      { x: 520, y: 40 },
      routedPort('Gi0/0', '10.20.0.1'),
      routedPort('Gi0/1', '10.20.1.1'),
      routedPort('Gi0/2', '10.20.2.1', MASK_30),
      routes([routeTo('192.168.50.0', '255.255.255.0', '10.20.2.2')]),
    )
    .add('pc', 'komsuPc', { x: 840, y: 40 }, staticHost('10.20.1.50', '10.20.1.1', []))
    .add(
      'firewall2Port',
      'firewall',
      { x: 520, y: 200 },
      routedPort('Gi0/0', '10.20.2.2', MASK_30),
      nameif('Gi0/0', 'outside', 0),
      routedPort('Gi0/1', '192.168.50.1'),
      nameif('Gi0/1', 'inside', 100),
      routes([routeTo('0.0.0.0', '0.0.0.0', '10.20.2.1')]),
      accessLists([{ name: OPEN_LIST, type: 'extended', entries: [{ seq: 10, kind: 'extended', action: 'permit', protocol: 'ip', source: ANY, destination: ANY }] }]),
      accessGroup('Gi0/0', OPEN_LIST, 'in'),
    )
    .add('switch8', 'switch', { x: 520, y: 340 })
    .add('pos', 'kasa', { x: 360, y: 480 }, staticHost('192.168.50.10', '192.168.50.1', []))
    .add('pc', 'depoPc', { x: 680, y: 480 }, staticHost('192.168.50.20', '192.168.50.1', []))
    .cable('serverLink', ['avmRouter', 'Gi0/0'], ['odemeSunucusu', 'eth0'], 'copperCross')
    .cable('tenantLink', ['avmRouter', 'Gi0/1'], ['komsuPc', 'eth0'], 'copperCross')
    .cable('shopLine', ['avmRouter', 'Gi0/2'], ['firewall', 'Gi0/0'], 'copperCross')
    .cable('shopUplink', ['firewall', 'Gi0/1'], ['switch', 'Fa0/8'])
    .cable('kasaLink', ['kasa', 'eth0'], ['switch', 'Fa0/1'])
    .cable('depoLink', ['depoPc', 'eth0'], ['switch', 'Fa0/2'])
    .build()
  return { state, layout }
}

const lab = mallLab()

export const mallShopFirewall: ExerciseDefinition = {
  ...MALL_SHOP_FIREWALL,
  lab,
  solvedWhen: [
    { type: 'reachable', fromDeviceId: 'kasa', toDeviceId: 'odemeSunucusu' },
    { type: 'unreachable', fromDeviceId: 'komsuPc', toDeviceId: 'kasa' },
    { type: 'unreachable', fromDeviceId: 'komsuPc', toDeviceId: 'depoPc' },
  ],
  locks: onlyEditable(
    lab.state.devices.map((device) => device.id),
    ['firewall'],
  ),
}
