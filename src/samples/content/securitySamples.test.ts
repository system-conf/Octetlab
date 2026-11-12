// What the security lesson texts promise, on the simulator (the samples' steps are manual: StepChecker's
// rule engine ignores ACL, NAT and remote logins).
import { describe, expect, it } from 'vitest'
import type { NetworkState, SolveCondition } from '../../domain'
import { createSimulation, SimSolveChecker, SimTerminal, type RemoteConnectOutcome, type SimRemoteConnectRequest } from '../../sim'
import { blockGuests, blockGuestsEverywhere, editDevice, GUEST_IN } from '../../scenarios/security/securityFixes'
import { accessGroup, accessLists, management, natRole } from '../../scenarios/security/securitySetup'
import { OLD_VTY_PASSWORD, securityGuestAcl, securityOfficePat, securitySshOnly, WEB_ADDRESS } from './securitySamples'

function holds(state: NetworkState, ...conditions: SolveCondition[]): boolean[] {
  return SimSolveChecker.check(state, conditions).map((result) => result.ok)
}

function connect(state: NetworkState, request: Omit<SimRemoteConnectRequest, 'kind'>): RemoteConnectOutcome {
  const engine = createSimulation(state)
  const requestId = engine.inject({ kind: 'remoteConnect', ...request })
  engine.runUntilDone(requestId)
  const result = engine.request(requestId)?.result
  if (result?.kind !== 'remoteConnect') throw new Error('no remoteConnect result')
  return result.outcome
}

const guestToTill: SolveCondition = { type: 'reachable', fromDeviceId: 'guest1', toDeviceId: 'pos1' }
const guestOnline: SolveCondition = { type: 'internet', fromDeviceId: 'guest1' }
const tillOnline: SolveCondition = { type: 'internet', fromDeviceId: 'pos1' }

describe('securityGuestAcl', () => {
  it('opens insecure: the guest laptop reaches the till, and everyone is online', () => {
    expect(holds(securityGuestAcl.lab().state, guestToTill, guestOnline, tillOnline)).toEqual([true, true, true])
  })

  it('applyInbound: GUEST_IN on Gi0/2 blocks the till and keeps guests online', () => {
    const blocked = blockGuests(securityGuestAcl.lab().state, 'r1')
    expect(holds(blocked, guestToTill, guestOnline, tillOnline)).toEqual([false, true, true])
    // The lesson quotes the guest's ping: R1 answers for the till.
    const lines = SimTerminal.run(createSimulation(blocked), 'guest1', 'ping 192.168.10.20').lines.map((line) => line.text ?? '')
    expect(lines).toContain('Reply from 192.168.20.1: Destination host unreachable.')
  })

  it('break it, standardAtSource: a standard deny of the guest network cuts guests off the internet', () => {
    expect(holds(blockGuestsEverywhere(securityGuestAcl.lab().state, 'r1'), guestToTill, guestOnline)).toEqual([false, false])
  })

  it('break it, wrongDirection: GUEST_IN outbound on Gi0/2 never sees guest traffic, nothing is blocked', () => {
    const state = blockGuests(securityGuestAcl.lab().state, 'r1')
    const outbound = editDevice(state, 'r1', (device) => ({
      ...device,
      ports: device.ports.map((port) => (port.id === 'Gi0/2' && port.role === 'routed' ? { ...port, l3: { ...port.l3, features: { accessGroups: { out: 'GUEST_IN' } } } } : port)),
    }))
    expect(holds(outbound, guestToTill, guestOnline)).toEqual([true, true])
  })

  it('break it, forgetPermit: without the permit line the implicit deny cuts guests off everything', () => {
    const denyOnly = { ...GUEST_IN, entries: GUEST_IN.entries.filter((entry) => entry.kind === 'extended' && entry.action === 'deny') }
    const state = editDevice(securityGuestAcl.lab().state, 'r1', accessLists([denyOnly]), accessGroup('Gi0/2', 'GUEST_IN', 'in'))
    expect(holds(state, guestToTill, guestOnline, tillOnline)).toEqual([false, false, true])
  })
})

describe('securityOfficePat', () => {
  const toWeb = (fromDeviceId: string): SolveCondition => ({ type: 'reachable', fromDeviceId, toDeviceId: 'web1' })

  it('opens working: both PCs reach the web server through PAT on R1', () => {
    expect(holds(securityOfficePat.lab().state, toWeb('pc1'), toWeb('pc2'))).toEqual([true, true])
  })

  it('break it, dropInside: without ip nat inside on Gi0/0 the answers have no way back', () => {
    const state = securityOfficePat.lab().state
    const noInside = editDevice(state, 'r1', (device) => ({
      ...device,
      ports: device.ports.map((port) => (port.id === 'Gi0/0' && port.role === 'routed' ? { ...port, l3: { ...port.l3, features: {} } } : port)),
    }))
    expect(holds(noInside, toWeb('pc1'))).toEqual([false])
    // Putting the role back restores it.
    expect(holds(editDevice(noInside, 'r1', natRole('Gi0/0', 'inside')), toWeb('pc1'))).toEqual([true])
  })

  it('break it, wrongNetwork: an access list for another network translates nothing', () => {
    const wrongList = editDevice(securityOfficePat.lab().state, 'r1', (device) => ({
      ...device,
      features: {
        ...device.features,
        accessLists: { lists: [{ name: '1', type: 'standard', entries: [{ seq: 10, kind: 'standard', action: 'permit', source: { address: '192.168.2.0', wildcard: '0.0.0.255' } }] }] },
      },
    }))
    expect(holds(wrongList, toWeb('pc1'))).toEqual([false])
  })

  it('the lesson addresses are the lab addresses', () => {
    const web = securityOfficePat.lab().state.devices.find((device) => device.id === 'web1')
    const nic = web?.ports.find((port) => port.id === 'eth0')
    expect(nic?.role === 'host' ? nic.l3.ipv4.address : undefined).toBe(WEB_ADDRESS)
  })
})

describe('securitySshOnly', () => {
  const ssh = management({
    domainName: 'lab.local',
    users: [{ name: 'admin', secret: 'Str0ng!', privilege: 15 }],
    ssh: { version: 2, rsaKeyBits: 2048 },
    lines: { vty: { loginLocal: true, transportInput: ['ssh'] } },
  })

  it('telnetToday: Telnet with the shared vty password opens a session', () => {
    expect(connect(securitySshOnly.lab().state, { deviceId: 'pc1', protocol: 'telnet', targetIp: '192.168.1.1', password: OLD_VTY_PASSWORD })).toMatchObject({ ok: true, hostname: 'R1' })
  })

  it('sshIn: after the setup SSH with the local user opens, Telnet is refused', () => {
    const state = editDevice(securitySshOnly.lab().state, 'r1', ssh)
    expect(connect(state, { deviceId: 'laptop1', protocol: 'ssh', targetIp: '192.168.1.1', username: 'admin', password: 'Str0ng!' })).toMatchObject({ ok: true, privilege: 15 })
    expect(connect(state, { deviceId: 'pc1', protocol: 'telnet', targetIp: '192.168.1.1', password: OLD_VTY_PASSWORD })).toMatchObject({ ok: false, failure: 'refused' })
  })

  it('break it, zeroizeKeys: without RSA keys SSH is refused too', () => {
    const state = editDevice(securitySshOnly.lab().state, 'r1', ssh, management({ ssh: { version: 2 } }))
    expect(connect(state, { deviceId: 'laptop1', protocol: 'ssh', targetIp: '192.168.1.1', username: 'admin', password: 'Str0ng!' })).toMatchObject({ ok: false, failure: 'refused' })
  })

  it('break it, noUsers: login local with no user fails authentication', () => {
    const state = editDevice(securitySshOnly.lab().state, 'r1', ssh, management({ users: [] }))
    expect(connect(state, { deviceId: 'laptop1', protocol: 'ssh', targetIp: '192.168.1.1', username: 'admin', password: 'Str0ng!' })).toMatchObject({ ok: false, failure: 'authFailed' })
  })
})
