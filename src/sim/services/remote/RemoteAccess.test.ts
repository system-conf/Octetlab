import { describe, expect, it } from 'vitest'
import type { AccessList, Device, ManagementSettings, NetworkState } from '../../../domain'
import { labHost, labLink, labRouter } from '../../../engine/testLabs'
import type { RemoteConnectOutcome, SimRemoteConnectRequest } from '../../contract'
import { createSimulation } from '../../createSimulation'

const ROUTER_IP = '192.168.1.1'

function withManagement(device: Device, management: ManagementSettings, lists: AccessList[] = []): Device {
  return {
    ...device,
    features: { ...device.features, management, ...(lists.length === 0 ? {} : { accessLists: { lists } }) },
  }
}

/** pc 192.168.1.10 — r1 Gi0/0 192.168.1.1 (hostname R1, the given management settings). */
function lab(management: ManagementSettings, lists: AccessList[] = []): NetworkState {
  const router = withManagement(labRouter('r1', [{ id: 'Gi0/0', ip: ROUTER_IP }]), { hostname: 'R1', ...management }, lists)
  return {
    devices: [labHost('pc', '192.168.1.10', { gateway: ROUTER_IP }), router],
    links: [labLink('l1', ['pc', 'eth0'], ['r1', 'Gi0/0'], { cable: 'copperCross' })],
  }
}

const SSH_READY: ManagementSettings = {
  domainName: 'lab.local',
  ssh: { rsaKeyBits: 1024, version: 2 },
  users: [{ name: 'admin', secret: 'cisco123', privilege: 15 }],
  lines: { vty: { loginLocal: true, transportInput: ['ssh'] } },
}

function connect(network: NetworkState, request: Omit<SimRemoteConnectRequest, 'kind' | 'deviceId'>) {
  const engine = createSimulation(network)
  const id = engine.inject({ kind: 'remoteConnect', deviceId: 'pc', ...request })
  engine.runUntilDone(id)
  const record = engine.request(id)
  if (record?.result?.kind !== 'remoteConnect') throw new Error('no remote result')
  return { engine, record, outcome: record.result.outcome }
}

const failure = (failureKind: string, reason: string): RemoteConnectOutcome => ({ ok: false, failure: failureKind, reason }) as RemoteConnectOutcome

describe('remote access: SSH server', () => {
  it('logs in with login local: handshake, login data, greeting, close', () => {
    const { outcome, engine } = connect(lab(SSH_READY), { protocol: 'ssh', targetIp: ROUTER_IP, username: 'admin', password: 'cisco123' })
    expect(outcome).toEqual({ ok: true, hostname: 'R1', privilege: 15 })
    const segments = engine
      .events()
      .filter((event) => (event.action === 'created' || event.action === 'sent') && event.protocol === 'ssh')
      .map((event) => {
        const outbound = event.outbound
        const packet = outbound?.kind === 'ethernet' && outbound.payload.kind === 'ipv4' ? outbound.payload : outbound?.kind === 'ipv4' ? outbound : null
        return packet?.payload.kind === 'tcp' ? [event.deviceId, packet.payload.flags.join('+')] : null
      })
      .filter((segment) => segment !== null)
    expect(segments).toEqual([
      ['pc', 'syn'],
      ['r1', 'syn+ack'],
      ['pc', 'ack+psh'],
      ['r1', 'ack+psh'],
      ['pc', 'ack+fin'],
    ])
    expect(engine.runtime('pc')?.services.sessions).toEqual([])
  })

  it('fails the login with a wrong password or an unknown user', () => {
    const network = lab(SSH_READY)
    expect(connect(network, { protocol: 'ssh', targetIp: ROUTER_IP, username: 'admin', password: 'wrong' }).outcome).toEqual(failure('authFailed', 'remoteLoginFailed'))
    expect(connect(network, { protocol: 'ssh', targetIp: ROUTER_IP, username: 'nobody', password: 'cisco123' }).outcome).toEqual(failure('authFailed', 'remoteLoginFailed'))
  })

  it('refuses SSH without RSA keys, and telnet when transport input is ssh only (RST)', () => {
    const noKeys = lab({ ...SSH_READY, ssh: { version: 2 } })
    expect(connect(noKeys, { protocol: 'ssh', targetIp: ROUTER_IP, username: 'admin', password: 'cisco123' }).outcome).toEqual(failure('refused', 'connectionRefused'))
    expect(connect(lab(SSH_READY), { protocol: 'telnet', targetIp: ROUTER_IP }).outcome).toEqual(failure('refused', 'connectionRefused'))
  })

  it('resets a source the vty access-class denies', () => {
    const onlyAdmin: AccessList = {
      name: '10',
      type: 'standard',
      entries: [{ kind: 'standard', seq: 10, action: 'permit', source: { address: '192.168.1.99', wildcard: '0.0.0.0' } }],
    }
    const denied = lab({ ...SSH_READY, lines: { vty: { ...SSH_READY.lines?.vty, accessClass: { in: '10' } } } }, [onlyAdmin])
    const { outcome, engine } = connect(denied, { protocol: 'ssh', targetIp: ROUTER_IP, username: 'admin', password: 'cisco123' })
    expect(outcome).toEqual(failure('refused', 'connectionRefused'))
    const reset = engine.events().find((event) => event.deviceId === 'r1' && event.notes.some((note) => note.message.key === 'simulation:reasons.vtyAccessDenied'))
    expect(reset).toBeDefined()
  })

  it('times out when nobody owns the address', () => {
    const { outcome } = connect(lab(SSH_READY), { protocol: 'ssh', targetIp: '192.168.1.99', username: 'admin', password: 'cisco123' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.failure).toBe('timedOut')
  })
})

describe('remote access: Telnet server', () => {
  it('refuses vty login without a password: "Password required, but none set"', () => {
    expect(connect(lab({}), { protocol: 'telnet', targetIp: ROUTER_IP }).outcome).toEqual(failure('passwordNotSet', 'remoteLoginFailed'))
  })

  it('checks the line password, or lets anybody in with no login', () => {
    const linePassword = lab({ lines: { vty: { password: 'vtypw' } }, bannerMotd: 'Authorized only' })
    expect(connect(linePassword, { protocol: 'telnet', targetIp: ROUTER_IP, password: 'vtypw' }).outcome).toEqual({
      ok: true,
      hostname: 'R1',
      privilege: 1,
      bannerMotd: 'Authorized only',
    })
    expect(connect(linePassword, { protocol: 'telnet', targetIp: ROUTER_IP }).outcome).toEqual(failure('authFailed', 'remoteLoginFailed'))
    expect(connect(lab({ lines: { vty: { login: false } } }), { protocol: 'telnet', targetIp: ROUTER_IP }).outcome).toMatchObject({ ok: true })
  })

  it('fails with an invalid address before sending anything', () => {
    expect(connect(lab({}), { protocol: 'telnet', targetIp: '300.1.1.1' }).outcome).toEqual(failure('localFailure', 'invalidConfig'))
  })
})
