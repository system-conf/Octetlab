// Firewall sample (docs/SAMPLE_LABS.md "ACL / NAT / SSH-AAA" row, firewall pack): an office behind a
// three-interface firewall appliance. Inside (100) reaches the DMZ (50) and the internet (0) through
// PAT, the DMZ web server is published with static NAT and an outside exception, and nothing lower starts
// a connection to anything higher on its own. Every step is manual: the rule engine behind StepChecker
// knows no firewall (docs/SIMULATION.md §10.3.8); the promises are tested in firewallSamples.test.ts.
import { MASK_30, routedPort, routes, routeTo } from '../../scenarios/design/deviceSetup'
import { LabBuilder } from '../../scenarios/design/labBuilder'
import { webException } from '../../scenarios/security/firewallSetup'
import { nameif, objectDynamicInterface, objectStaticNat } from '../../scenarios/security/firewallSetup'
import { accessGroup, accessLists } from '../../scenarios/security/securitySetup'
import type { SampleDefinition } from '../contract'
import { finishLab, staticNic } from './sampleKit'

export const FIREWALL_WEB_ADDRESS = '172.16.1.10'
export const FIREWALL_PUBLISHED_ADDRESS = '203.0.113.10'
export const HOME_ADDRESS = '198.51.100.20'

const INSIDE = { nameif: 'inside', portId: 'Gi0/1' }
const DMZ = { nameif: 'dmz', portId: 'Gi0/2' }
const OUTSIDE = { nameif: 'outside', portId: 'Gi0/0' }

export const securityFirewallOffice: SampleDefinition = {
  id: 'securityFirewallOffice',
  category: 'security',
  order: 4,
  level: 'intermediate',
  features: [],
  lab: () =>
    finishLab(
      new LabBuilder(3904)
        .add('laptop', 'home1', { x: 840, y: 40 }, staticNic(HOME_ADDRESS, undefined, '198.51.100.1'))
        // The provider routes the office's public block 203.0.113.8/29 to the firewall's line address.
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
          'fw1',
          { x: 520, y: 200 },
          routedPort('Gi0/0', '203.0.113.2', MASK_30),
          nameif('Gi0/0', 'outside', 0),
          routedPort('Gi0/1', '192.168.1.1'),
          nameif('Gi0/1', 'inside', 100),
          routedPort('Gi0/2', '172.16.1.1'),
          nameif('Gi0/2', 'dmz', 50),
          routes([routeTo('0.0.0.0', '0.0.0.0', '203.0.113.1')]),
          objectDynamicInterface('INSIDE_NET', '192.168.1.0', '255.255.255.0', '0.0.0.255', INSIDE, OUTSIDE),
          objectStaticNat('WEB_SERVER', FIREWALL_WEB_ADDRESS, FIREWALL_PUBLISHED_ADDRESS, DMZ, OUTSIDE),
          accessLists([webException(FIREWALL_WEB_ADDRESS)]),
          accessGroup('Gi0/0', 'OUTSIDE_IN', 'in'),
        )
        .add('server', 'web1', { x: 840, y: 340 }, staticNic(FIREWALL_WEB_ADDRESS, undefined, '172.16.1.1'))
        .add('switch8', 'sw1', { x: 360, y: 340 })
        .add('pc', 'pc1', { x: 240, y: 480 }, staticNic('192.168.1.10', undefined, '192.168.1.1'))
        .add('pc', 'pc2', { x: 480, y: 480 }, staticNic('192.168.1.11', undefined, '192.168.1.1'))
        .cable('homeLink', ['isp', 'Gi0/0'], ['home1', 'eth0'], 'copperCross')
        .cable('accessLine', ['isp', 'Gi0/1'], ['fw1', 'Gi0/0'], 'copperCross')
        .cable('dmzLink', ['fw1', 'Gi0/2'], ['web1', 'eth0'], 'copperCross')
        .cable('lanUplink', ['fw1', 'Gi0/1'], ['sw1', 'Fa0/8'])
        .cable('pc1Link', ['pc1', 'eth0'], ['sw1', 'Fa0/1'])
        .cable('pc2Link', ['pc2', 'eth0'], ['sw1', 'Fa0/2']),
    ),
  steps: [
    { id: 'readLevels', focusDeviceId: 'fw1' },
    { id: 'insideOut', focusDeviceId: 'pc1' },
    { id: 'dmzCannotStart', mode: 'simulation', focusDeviceId: 'web1' },
    { id: 'publishedSite', focusDeviceId: 'home1' },
    { id: 'readConnections', focusDeviceId: 'fw1' },
  ],
  breakIt: ['unbindException', 'noNameifDmz', 'dmzLevel100'],
  related: [
    { kind: 'exercise', exerciseId: 'dmzWebsite' },
    { kind: 'exercise', exerciseId: 'mallShopFirewall' },
    { kind: 'exercise', exerciseId: 'clinicFirewallLevel' },
    { kind: 'sample', sampleId: 'securityGuestAcl' },
    { kind: 'sample', sampleId: 'securityOfficePat' },
  ],
}

export const firewallSamples: readonly SampleDefinition[] = [securityFirewallOffice]
