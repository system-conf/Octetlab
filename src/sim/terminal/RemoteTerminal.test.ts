import { describe, expect, it } from 'vitest'
import type { ManagementSettings, NetworkState, TerminalLine } from '../../domain'
import { labHost, labLink, labRouter } from '../../engine/testLabs'
import { createSimulation } from '../createSimulation'
import { SimTerminal } from './index'

function lab(management: ManagementSettings): NetworkState {
  const router = labRouter('r1', [{ id: 'Gi0/0', ip: '192.168.1.1' }])
  return {
    devices: [labHost('pc', '192.168.1.10', { gateway: '192.168.1.1' }), { ...router, features: { management: { hostname: 'R1', ...management } } }],
    links: [labLink('l1', ['pc', 'eth0'], ['r1', 'Gi0/0'], { cable: 'copperCross' })],
  }
}

function run(network: NetworkState, line: string): string[] {
  return SimTerminal.run(createSimulation(network), 'pc', line).lines.map((entry: TerminalLine) => entry.text ?? `{${entry.message?.key ?? ''}}`)
}

const SSH: ManagementSettings = {
  domainName: 'lab.local',
  ssh: { rsaKeyBits: 1024 },
  users: [{ name: 'admin', secret: 'cisco123' }],
  lines: { vty: { loginLocal: true } },
}

describe('host terminal: ssh / telnet', () => {
  it('logs in over SSH with -pw, or with user@ip', () => {
    expect(run(lab(SSH), 'ssh -l admin -pw cisco123 192.168.1.1')).toEqual(['{remoteAccess:session.opened}'])
    expect(run(lab(SSH), 'ssh admin@192.168.1.1 -pw cisco123')).toEqual(['{remoteAccess:session.opened}'])
  })

  it('explains a missing password and prints authentication failures', () => {
    expect(run(lab(SSH), 'ssh -l admin 192.168.1.1')).toEqual(['% Authentication failed', '{remoteAccess:terminal.passwordHint}'])
    expect(run(lab(SSH), 'telnet 192.168.1.1 -l admin -pw bad')).toEqual([
      'Trying 192.168.1.1 ... Open',
      '',
      'User Access Verification',
      '',
      '% Login invalid',
      '',
      '[Connection to 192.168.1.1 closed by foreign host]',
    ])
  })

  it('is refused without keys and when the vty takes no password', () => {
    expect(run(lab({}), 'ssh -l admin -pw x 192.168.1.1')).toEqual(['% Connection refused by remote host'])
    expect(run(lab({}), 'telnet 192.168.1.1')).toEqual([
      'Trying 192.168.1.1 ... Open',
      '',
      'Password required, but none set',
      '',
      '[Connection to 192.168.1.1 closed by foreign host]',
    ])
  })

  it('prints the usage for a bad command line', () => {
    expect(run(lab({}), 'ssh 192.168.1.1')).toEqual(['{remoteAccess:terminal.sshUsage}'])
    expect(run(lab({}), 'telnet')).toEqual(['{remoteAccess:terminal.telnetUsage}'])
    expect(run(lab({}), 'telnet 192.168.1.1 -pw')).toEqual(['{remoteAccess:terminal.telnetUsage}'])
  })
})
