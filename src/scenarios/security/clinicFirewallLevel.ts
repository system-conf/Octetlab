// Firewall pack exercise 3: a dental clinic's firewall was replaced over the weekend. The technician named
// the inside interface "lan" instead of "inside", so it got no security level (0), the same as the
// outside interface: equal levels pass nothing, and the clinic is offline. Solved when both PCs reach the
// internet again. Only the firewall is editable, and its firewall-wide settings (security section:
// same-security-traffic, access lists, NAT) are read-only, so the fix is the level on the interface, not
// the same-security workaround. Graded by SimSolveChecker; the oracle skips firewall labs.
import type { ExerciseDefinition, ExerciseLock } from '../../domain'
import { defaultRouteVia, PUBLIC_DNS, routedPort, routes, staticHost, wanPort } from '../design/deviceSetup'
import { LabBuilder } from '../design/labBuilder'
import { onlyEditable } from './exerciseLocks'
import { nameif } from './firewallSetup'
import { CLINIC_FIREWALL_LEVEL } from './securityExerciseIndex'

/** The nameif the technician typed on the inside interface (Gi0/1). */
export const WRONG_NAMEIF = 'lan'

function clinicLab() {
  const { state, layout } = new LabBuilder(5303)
    .add('internetCloud', 'internet', { x: 520, y: 40 })
    .add(
      'firewall2Port',
      'firewall',
      { x: 520, y: 200 },
      wanPort('Gi0/0'),
      nameif('Gi0/0', 'outside', 0),
      routedPort('Gi0/1', '192.168.10.1'),
      nameif('Gi0/1', WRONG_NAMEIF),
      routes([defaultRouteVia('Gi0/0')]),
    )
    .add('switch8', 'switch', { x: 520, y: 340 })
    .add('pc', 'resepsiyonPc', { x: 360, y: 480 }, staticHost('192.168.10.10', '192.168.10.1', [PUBLIC_DNS]))
    .add('pc', 'doktorPc', { x: 680, y: 480 }, staticHost('192.168.10.20', '192.168.10.1', [PUBLIC_DNS]))
    .cable('wan', ['internet', 'eth0'], ['firewall', 'Gi0/0'])
    .cable('clinicUplink', ['firewall', 'Gi0/1'], ['switch', 'Fa0/8'])
    .cable('resepsiyonLink', ['resepsiyonPc', 'eth0'], ['switch', 'Fa0/1'])
    .cable('doktorLink', ['doktorPc', 'eth0'], ['switch', 'Fa0/2'])
    .build()
  return { state, layout }
}

const lab = clinicLab()

/** Firewall-wide settings stay as given (docs/FIREWALL_PACK.md §7: the firewall card locks with `security`). */
const securityLock: ExerciseLock = { scope: 'section', deviceId: 'firewall', section: 'security', access: 'readOnly' }

export const clinicFirewallLevel: ExerciseDefinition = {
  ...CLINIC_FIREWALL_LEVEL,
  lab,
  solvedWhen: [
    { type: 'internet', fromDeviceId: 'resepsiyonPc' },
    { type: 'internet', fromDeviceId: 'doktorPc' },
  ],
  locks: [
    ...onlyEditable(
      lab.state.devices.map((device) => device.id),
      ['firewall'],
    ),
    securityLock,
  ],
}
