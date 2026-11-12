// Pack 5.2 NAT exercise: the provider hands the office one public address (203.0.113.2/30) and routes
// only that address back. The office PCs (192.168.1.0/24) reach the tax portal (198.51.100.10) only once
// the router translates them (PAT / overload). There is no cloud here on purpose: the cloud answers
// private sources (SECURITY_PACK.md §2.1), the provider router does not. Only the office router is
// editable. Graded by SimSolveChecker; the rule engine ignores NAT (docs/SIMULATION.md §10.3).
import type { ExerciseDefinition } from '../../domain'
import { MASK_30, routedPort, routes, routeTo, staticHost } from '../design/deviceSetup'
import { LabBuilder } from '../design/labBuilder'
import { onlyEditable } from './exerciseLocks'
import { OFFICE_SHARED_IP } from './securityExerciseIndex'

export const PORTAL_ADDRESS = '198.51.100.10'

function officeLab() {
  const { state, layout } = new LabBuilder(5202)
    .add('server', 'portal', { x: 820, y: 40 }, staticHost(PORTAL_ADDRESS, '198.51.100.1', []))
    // The provider router knows its own two networks only: no route back to private addresses.
    .add('router2Port', 'isp', { x: 520, y: 40 }, routedPort('Gi0/0', '198.51.100.1'), routedPort('Gi0/1', '203.0.113.1', MASK_30), routes([]))
    .add(
      'router2Port',
      'router',
      { x: 520, y: 200 },
      routedPort('Gi0/0', '192.168.1.1'),
      routedPort('Gi0/1', '203.0.113.2', MASK_30),
      routes([routeTo('0.0.0.0', '0.0.0.0', '203.0.113.1')]),
    )
    .add('switch8', 'switch', { x: 520, y: 340 })
    .add('pc', 'muhasebePc', { x: 360, y: 480 }, staticHost('192.168.1.10', '192.168.1.1', []))
    .add('pc', 'mudurPc', { x: 680, y: 480 }, staticHost('192.168.1.11', '192.168.1.1', []))
    .cable('portalLink', ['isp', 'Gi0/0'], ['portal', 'eth0'], 'copperCross')
    .cable('accessLine', ['isp', 'Gi0/1'], ['router', 'Gi0/1'], 'copperCross')
    .cable('officeUplink', ['router', 'Gi0/0'], ['switch', 'Fa0/8'])
    .cable('muhasebeLink', ['muhasebePc', 'eth0'], ['switch', 'Fa0/1'])
    .cable('mudurLink', ['mudurPc', 'eth0'], ['switch', 'Fa0/2'])
    .build()
  return { state, layout }
}

const lab = officeLab()

export const officeSharedIp: ExerciseDefinition = {
  ...OFFICE_SHARED_IP,
  lab,
  solvedWhen: [
    { type: 'reachable', fromDeviceId: 'muhasebePc', toDeviceId: 'portal' },
    { type: 'reachable', fromDeviceId: 'mudurPc', toDeviceId: 'portal' },
  ],
  locks: onlyEditable(
    lab.state.devices.map((device) => device.id),
    ['router'],
  ),
}
