// Pack 5.2 ACL exercise: a café's guest Wi-Fi (192.168.20.0/24) reaches the till and the office PC
// (192.168.10.0/24) through the router. Solved when guests can no longer reach either, while guests and
// the till still get online. Only the router is editable. Graded by SimSolveChecker (ExerciseAttempt):
// the rule engine ignores ACLs (docs/SIMULATION.md §10.3).
import type { ExerciseDefinition } from '../../domain'
import { defaultRouteVia, PUBLIC_DNS, routedPort, routes, ssids, staticHost, wanPort } from '../design/deviceSetup'
import { LabBuilder } from '../design/labBuilder'
import { onlyEditable } from './exerciseLocks'
import { CAFE_GUEST_WIFI } from './securityExerciseIndex'

export const GUEST_SSID = 'KafeMisafir'

function cafeLab() {
  const { state, layout } = new LabBuilder(5201)
    .add('internetCloud', 'internet', { x: 520, y: 40 })
    .add(
      'router3Port',
      'router',
      { x: 520, y: 180 },
      routedPort('Gi0/0', '192.168.10.1'),
      wanPort('Gi0/1'),
      routedPort('Gi0/2', '192.168.20.1'),
      routes([defaultRouteVia('Gi0/1')]),
    )
    .add('switch8', 'switch', { x: 300, y: 320 })
    .add('pos', 'kasa', { x: 180, y: 480 }, staticHost('192.168.10.20', '192.168.10.1', [PUBLIC_DNS]))
    .add('pc', 'ofisPc', { x: 420, y: 480 }, staticHost('192.168.10.30', '192.168.10.1', [PUBLIC_DNS]))
    .add('accessPoint', 'misafirAp', { x: 740, y: 320 }, ssids([{ ssid: GUEST_SSID, vlan: 1 }]))
    .add('laptop', 'misafirLaptop', { x: 740, y: 480 }, staticHost('192.168.20.50', '192.168.20.1', [PUBLIC_DNS], 'wlan0'))
    .cable('wan', ['internet', 'eth0'], ['router', 'Gi0/1'])
    .cable('officeUplink', ['router', 'Gi0/0'], ['switch', 'Fa0/8'])
    .cable('kasaLink', ['kasa', 'eth0'], ['switch', 'Fa0/1'])
    .cable('ofisPcLink', ['ofisPc', 'eth0'], ['switch', 'Fa0/2'])
    .cable('apUplink', ['router', 'Gi0/2'], ['misafirAp', 'Gi0'])
    .wireless('guestWifi', 'misafirLaptop', 'misafirAp', GUEST_SSID)
    .build()
  return { state, layout }
}

const lab = cafeLab()

export const cafeGuestWifi: ExerciseDefinition = {
  ...CAFE_GUEST_WIFI,
  lab,
  solvedWhen: [
    { type: 'unreachable', fromDeviceId: 'misafirLaptop', toDeviceId: 'kasa' },
    { type: 'unreachable', fromDeviceId: 'misafirLaptop', toDeviceId: 'ofisPc' },
    { type: 'internet', fromDeviceId: 'misafirLaptop' },
    { type: 'internet', fromDeviceId: 'kasa' },
  ],
  locks: onlyEditable(
    lab.state.devices.map((device) => device.id),
    ['router'],
  ),
}
