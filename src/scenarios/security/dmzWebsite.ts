// Firewall pack exercise 2: an architecture office moved its portfolio website onto its own server in
// the firewall's DMZ (172.16.1.10). The provider routes the office's extra public block (203.0.113.8/29)
// to the firewall, and the site is meant to answer at 203.0.113.10. Customers cannot open it: there is no
// static translation and no exception on the outside interface. Solved when a customer's laptop on the
// internet reaches the site, the office PC still reaches the server, and the server still cannot open
// connections into the office (DMZ 50 → inside 100). Only the firewall is editable and its routing stays
// as it is. The customer's link has targetKind 'internet': its public address belongs to no lab device
// (static NAT), which is how an internet target counts (AppLinkVerdicts).
import type { ExerciseDefinition, ExerciseLock } from '../../domain'
import { type DeviceChange, MASK_30, routedPort, routes, routeTo, staticHost } from '../design/deviceSetup'
import { LabBuilder } from '../design/labBuilder'
import { onlyEditable } from './exerciseLocks'
import { nameif } from './firewallSetup'
import { DMZ_WEBSITE } from './securityExerciseIndex'

export const WEB_SERVER_ADDRESS = '172.16.1.10'
export const PUBLISHED_ADDRESS = '203.0.113.10'

/** The customer's bookmark of the office website (label = id, localized from `exercises:dmzWebsite.appLinks`). */
const customerBookmark: DeviceChange = (device) => {
  if (!device.host) throw new Error(`${device.id} is not an end device`)
  return { ...device, host: { ...device.host, appLinks: [{ id: 'firmaSitesi', label: 'firmaSitesi', targetIp: PUBLISHED_ADDRESS, targetKind: 'internet' }] } }
}

function officeLab() {
  const { state, layout } = new LabBuilder(5302)
    .add('laptop', 'musteriLaptop', { x: 840, y: 40 }, staticHost('198.51.100.20', '198.51.100.1', []), customerBookmark)
    // The provider routes the office's public block to the firewall's line address.
    .add(
      'router2Port',
      'isp',
      { x: 520, y: 40 },
      routedPort('Gi0/0', '198.51.100.1'),
      routedPort('Gi0/1', '203.0.113.1', MASK_30),
      routes([routeTo('203.0.113.8', '255.255.255.248', '203.0.113.2')]),
    )
    .add(
      'firewall3Port',
      'firewall',
      { x: 520, y: 200 },
      routedPort('Gi0/0', '203.0.113.2', MASK_30),
      nameif('Gi0/0', 'outside', 0),
      routedPort('Gi0/1', '192.168.1.1'),
      nameif('Gi0/1', 'inside', 100),
      routedPort('Gi0/2', '172.16.1.1'),
      nameif('Gi0/2', 'dmz', 50),
      routes([routeTo('0.0.0.0', '0.0.0.0', '203.0.113.1')]),
    )
    .add('server', 'webSunucu', { x: 840, y: 340 }, staticHost(WEB_SERVER_ADDRESS, '172.16.1.1', []))
    .add('switch8', 'switch', { x: 360, y: 340 })
    .add('pc', 'mimarPc', { x: 240, y: 480 }, staticHost('192.168.1.10', '192.168.1.1', []))
    .add('pc', 'sekreterPc', { x: 480, y: 480 }, staticHost('192.168.1.11', '192.168.1.1', []))
    .cable('customerLink', ['isp', 'Gi0/0'], ['musteriLaptop', 'eth0'], 'copperCross')
    .cable('accessLine', ['isp', 'Gi0/1'], ['firewall', 'Gi0/0'], 'copperCross')
    .cable('dmzLink', ['firewall', 'Gi0/2'], ['webSunucu', 'eth0'], 'copperCross')
    .cable('officeUplink', ['firewall', 'Gi0/1'], ['switch', 'Fa0/8'])
    .cable('mimarLink', ['mimarPc', 'eth0'], ['switch', 'Fa0/1'])
    .cable('sekreterLink', ['sekreterPc', 'eth0'], ['switch', 'Fa0/2'])
    .build()
  return { state, layout }
}

const lab = officeLab()

/** The firewall's routes stay as given: the site is published with NAT and an access rule, not with routes. */
const routingLock: ExerciseLock = { scope: 'section', deviceId: 'firewall', section: 'routing', access: 'readOnly' }

export const dmzWebsite: ExerciseDefinition = {
  ...DMZ_WEBSITE,
  lab,
  solvedWhen: [
    { type: 'appLinksOk', deviceId: 'musteriLaptop' },
    { type: 'reachable', fromDeviceId: 'mimarPc', toDeviceId: 'webSunucu' },
    { type: 'unreachable', fromDeviceId: 'webSunucu', toDeviceId: 'mimarPc' },
  ],
  locks: [
    ...onlyEditable(
      lab.state.devices.map((device) => device.id),
      ['firewall'],
    ),
    routingLock,
  ],
}
