// Security samples (docs/SAMPLE_LABS.md "ACL / NAT / SSH-AAA", pack 5.2): a guest Wi-Fi kept away from the
// till with an extended ACL, an office sharing one public address with PAT, and router management moved
// from Telnet to SSH. Every step is manual: the rule engine behind StepChecker ignores ACL, NAT and remote
// logins (docs/SIMULATION.md §10.3.7); the simulator-side promises are tested in securitySamples.test.ts.
import { defaultRouteVia, MASK_30, PUBLIC_DNS, routedPort, routes, routeTo, ssids, wanPort } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import { interfaceOverload, management, net } from '../../scenarios/security/securitySetup'
import type { SampleDefinition } from '../contract'
import { finishLab, staticNic } from './sampleKit'

export const GUEST_SSID = 'GUEST'
export const WEB_ADDRESS = '198.51.100.10'
/** The old vty password of the SSH sample (lab data, shown in the lesson). */
export const OLD_VTY_PASSWORD = 'Kafe2024'

export const securityGuestAcl: SampleDefinition = {
  id: 'securityGuestAcl',
  category: 'security',
  order: 1,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3901)
        .add('internetCloud', 'isp', { x: 520, y: 40 })
        .add(
          'router3Port',
          'r1',
          { x: 520, y: 180 },
          routedPort('Gi0/0', '192.168.10.1'),
          wanPort('Gi0/1'),
          routedPort('Gi0/2', '192.168.20.1'),
          routes([defaultRouteVia('Gi0/1')]),
        )
        .add('switch8', 'sw1', { x: 300, y: 320 })
        .add('pos', 'pos1', { x: 180, y: 480 }, staticNic('192.168.10.20', undefined, '192.168.10.1', [PUBLIC_DNS]))
        .add('pc', 'pc1', { x: 420, y: 480 }, staticNic('192.168.10.30', undefined, '192.168.10.1', [PUBLIC_DNS]))
        .add('accessPoint', 'ap1', { x: 740, y: 320 }, ssids([{ ssid: GUEST_SSID, vlan: 1 }]))
        .add('laptop', 'guest1', { x: 740, y: 480 }, staticNic('192.168.20.50', undefined, '192.168.20.1', [PUBLIC_DNS], 'wlan0'))
        .cable('wan', ['isp', 'eth0'], ['r1', 'Gi0/1'])
        .cable('officeUplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pos1Link', ['pos1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/2'])
        .cable('apUplink', ['r1', 'Gi0/2'], ['ap1', 'Gi0'])
        .wireless('guestWifi', 'guest1', 'ap1', GUEST_SSID),
    ),
  steps: [
    { id: 'guestSeesTill', focusDeviceId: 'guest1' },
    { id: 'writeList', focusDeviceId: 'r1' },
    { id: 'applyInbound', focusDeviceId: 'r1' },
    { id: 'readCounters', focusDeviceId: 'r1' },
    { id: 'watchDrop', mode: 'simulation', focusDeviceId: 'r1' },
  ],
  breakIt: ['forgetPermit', 'wrongDirection', 'standardAtSource'],
  related: [
    { kind: 'exercise', exerciseId: 'cafeGuestWifi' },
    { kind: 'sample', sampleId: 'securityOfficePat' },
  ],
}

export const securityOfficePat: SampleDefinition = {
  id: 'securityOfficePat',
  category: 'security',
  order: 2,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3902)
        .add('server', 'web1', { x: 820, y: 40 }, staticNic(WEB_ADDRESS, undefined, '198.51.100.1'))
        // The provider routes back only the public address it gave the office.
        .add('router2Port', 'isp', { x: 520, y: 40 }, routedPort('Gi0/0', '198.51.100.1'), routedPort('Gi0/1', '203.0.113.1', MASK_30), routes([]))
        .add(
          'router2Port',
          'r1',
          { x: 520, y: 200 },
          routedPort('Gi0/0', '192.168.1.1'),
          routedPort('Gi0/1', '203.0.113.2', MASK_30),
          routes([routeTo('0.0.0.0', '0.0.0.0', '203.0.113.1')]),
          ...interfaceOverload('1', net('192.168.1.0', '0.0.0.255'), 'Gi0/0', 'Gi0/1'),
        )
        .add('switch8', 'sw1', { x: 520, y: 340 })
        .add('pc', 'pc1', { x: 360, y: 480 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('pc', 'pc2', { x: 680, y: 480 }, staticNic('192.168.1.11', undefined, '192.168.1.1'))
        .cable('webLink', ['isp', 'Gi0/0'], ['web1', 'eth0'], 'copperCross')
        .cable('accessLine', ['isp', 'Gi0/1'], ['r1', 'Gi0/1'], 'copperCross')
        .cable('lanUplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'pingWeb', focusDeviceId: 'pc1' },
    { id: 'readTranslations', focusDeviceId: 'r1' },
    { id: 'watchRewrite', mode: 'simulation', focusDeviceId: 'r1' },
    { id: 'readStatistics', focusDeviceId: 'r1' },
  ],
  breakIt: ['dropInside', 'wrongNetwork'],
  related: [
    { kind: 'exercise', exerciseId: 'officeSharedIp' },
    { kind: 'sample', sampleId: 'securityGuestAcl' },
    { kind: 'sample', sampleId: 'routingStaticDefault' },
  ],
}

export const securitySshOnly: SampleDefinition = {
  id: 'securitySshOnly',
  category: 'security',
  order: 3,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3903)
        .add(
          'router2Port',
          'r1',
          { x: 420, y: 80 },
          routedPort('Gi0/0', '192.168.1.1'),
          routes([]),
          // Today's state: Telnet with one shared vty password.
          management({ lines: { vty: { password: OLD_VTY_PASSWORD, login: true } } }),
        )
        .add('switch8', 'sw1', { x: 420, y: 240 })
        .add('pc', 'pc1', { x: 260, y: 400 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('laptop', 'laptop1', { x: 580, y: 400 }, staticNic('192.168.1.20', undefined, '192.168.1.1'))
        .cable('lanUplink', ['r1', 'Gi0/0'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('laptop1Link', ['laptop1', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'telnetToday', focusDeviceId: 'pc1' },
    { id: 'prepareKeys', focusDeviceId: 'r1' },
    { id: 'localUser', focusDeviceId: 'r1' },
    { id: 'sshOnly', focusDeviceId: 'r1' },
    { id: 'sshIn', focusDeviceId: 'laptop1' },
  ],
  breakIt: ['zeroizeKeys', 'noUsers'],
  related: [
    { kind: 'sample', sampleId: 'securityGuestAcl' },
  ],
}

export const securitySamples: readonly SampleDefinition[] = [securityGuestAcl, securityOfficePat, securitySshOnly]
