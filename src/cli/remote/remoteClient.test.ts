import { describe, expect, it } from 'vitest'
import type { Device } from '../../domain'
import type { RemoteConnectOutcome, SimRequest } from '../../sim/contract'
import { finished } from '../router/testRouterCli'
import { labRouter } from '../../engine/testLabs'
import { RemoteCli } from './testRemoteCli'

const TARGET = '192.168.1.2'

function job(cli: RemoteCli): SimRequest {
  const request = cli.last.job
  if (request === undefined) throw new Error('no job')
  return request
}

function answer(cli: RemoteCli, outcome: RemoteConnectOutcome): string[] {
  const request = job(cli)
  if (request.kind !== 'remoteConnect') throw new Error('not a remote job')
  return cli.finish(finished('r1', request, { kind: 'remoteConnect', protocol: request.protocol, targetIp: request.targetIp, outcome }))
}

/** A peer router owning TARGET with the given vty login. */
function peer(vty: NonNullable<NonNullable<Device['features']>['management']>['lines']): Device {
  const device = labRouter('r2', [{ id: 'Gi0/0', ip: TARGET }])
  return { ...device, features: { management: { hostname: 'R2', ...(vty === undefined ? {} : { lines: vty }) } } }
}

const OPENED: RemoteConnectOutcome = { ok: true, hostname: 'R2', privilege: 15 }
const AUTH_FAILED: RemoteConnectOutcome = { ok: false, failure: 'authFailed', reason: 'remoteLoginFailed' }

describe('router CLI: ssh', () => {
  it('connects with the user name, asks the password, then logs in', () => {
    const cli = new RemoteCli()
    cli.type('ssh -l admin ' + TARGET)
    expect(job(cli)).toEqual({ kind: 'remoteConnect', deviceId: 'r1', protocol: 'ssh', targetIp: TARGET, username: 'admin' })
    expect(answer(cli, AUTH_FAILED)).toEqual([])
    expect(cli.prompt).toBe('Password: ')
    expect(cli.last.input).toBe('secret')
    cli.type('cisco123')
    expect(job(cli)).toEqual({ kind: 'remoteConnect', deviceId: 'r1', protocol: 'ssh', targetIp: TARGET, username: 'admin', password: 'cisco123' })
    expect(answer(cli, OPENED)).toEqual(['{remoteAccess:session.opened}'])
    expect(cli.prompt).toBe('Router>')
  })

  it('prints refused, timed out and authentication failures', () => {
    const cli = new RemoteCli()
    cli.type('ssh -v 2 -l admin ' + TARGET)
    expect(answer(cli, { ok: false, failure: 'refused', reason: 'connectionRefused' })).toEqual(['% Connection refused by remote host'])
    cli.type('ssh -l admin ' + TARGET)
    expect(answer(cli, { ok: false, failure: 'timedOut', reason: 'requestTimedOut' })).toEqual(['% Connection timed out; remote host not responding'])
    cli.type('ssh -l admin ' + TARGET)
    answer(cli, AUTH_FAILED)
    cli.type('wrong')
    expect(answer(cli, AUTH_FAILED)).toEqual(['% Authentication failed'])
    expect(cli.type('ssh -l admin www.lab')).toEqual(['% Unknown command or computer name, or unable to find computer address'])
  })
})

describe('router CLI: telnet', () => {
  it('Password required, but none set', () => {
    const cli = new RemoteCli()
    cli.type('telnet ' + TARGET)
    expect(answer(cli, { ok: false, failure: 'passwordNotSet', reason: 'remoteLoginFailed' })).toEqual([
      `Trying ${TARGET} ... Open`,
      '',
      'Password required, but none set',
      '',
      `[Connection to ${TARGET} closed by foreign host]`,
    ])
  })

  it('asks user name and password for login local, only the password for a line password', () => {
    const cli = new RemoteCli()
    cli.peers = [peer({ vty: { loginLocal: true } })]
    cli.type('telnet ' + TARGET)
    expect(answer(cli, AUTH_FAILED)).toEqual([`Trying ${TARGET} ... Open`, '', 'User Access Verification', ''])
    expect(cli.prompt).toBe('Username: ')
    cli.type('admin')
    expect(cli.prompt).toBe('Password: ')
    cli.type('bad')
    expect(job(cli)).toMatchObject({ protocol: 'telnet', username: 'admin', password: 'bad' })
    expect(answer(cli, AUTH_FAILED)).toEqual(['% Login invalid', '', `[Connection to ${TARGET} closed by foreign host]`])

    cli.peers = [peer({ vty: { password: 'vtypw' } })]
    cli.type('telnet ' + TARGET)
    answer(cli, AUTH_FAILED)
    expect(cli.prompt).toBe('Password: ')
    cli.type('nope')
    expect(answer(cli, AUTH_FAILED)).toEqual(['% Bad passwords', '', `[Connection to ${TARGET} closed by foreign host]`])
  })

  it('opens at once with no login and shows the banner', () => {
    const cli = new RemoteCli()
    cli.type('telnet ' + TARGET)
    expect(answer(cli, { ok: true, hostname: 'R2', privilege: 1, bannerMotd: 'Lab only' })).toEqual([
      `Trying ${TARGET} ... Open`,
      '',
      'Lab only',
      '',
      '{remoteAccess:session.opened}',
    ])
  })
})
