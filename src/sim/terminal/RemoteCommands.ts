// `ssh` / `telnet` on the host terminal (pack 5.2, scope A). The terminal runs a command to its end and
// cannot ask questions, so the credentials are options: `ssh -l <user> [-pw <password>] <ip>` (also
// `user@ip`) and `telnet <ip> [-l <user>] [-pw <password>]`. `-l` is the OpenSSH / Windows telnet option;
// `-pw` is PuTTY plink's (a lab choice). Output is the Packet Tracer / IOS client text (RemoteSessionLines).
import type { NetworkState, TerminalLine } from '../../domain'
import { messageLine } from '../../engine/terminalLines'
import { localizedMessage } from '../../i18n/messageKeys'
import { Ipv4 } from '../../net/Ipv4'
import type { RequestRecord, SimRemoteConnectRequest } from '../contract'
import { VtyAccess } from '../services/remote/VtyAccess'
import { RemoteSessionLines } from './RemoteSessionLines'

export type RemoteProtocol = 'ssh' | 'telnet'

/** A parsed command: the request to inject, or the usage text. */
export type RemoteCommandParse = { readonly ok: true; readonly request: SimRemoteConnectRequest } | { readonly ok: false; readonly lines: TerminalLine[] }

export class RemoteCommands {
  static parse(deviceId: string, protocol: RemoteProtocol, args: readonly string[]): RemoteCommandParse {
    let username: string | undefined
    let password: string | undefined
    let host: string | undefined
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index] ?? ''
      const flag = arg.toLowerCase()
      if (flag === '-l' || flag === '-pw') {
        const value = args[index + 1]
        if (value === undefined) return RemoteCommands.usage(protocol)
        if (flag === '-l') username = value
        else password = value
        index += 1
      } else if (host === undefined) {
        host = arg
      } else {
        return RemoteCommands.usage(protocol)
      }
    }
    if (protocol === 'ssh' && host?.includes('@') === true && username === undefined) {
      const at = host.lastIndexOf('@')
      username = host.slice(0, at)
      host = host.slice(at + 1)
    }
    if (host === undefined || !Ipv4.isValid(host) || (protocol === 'ssh' && (username === undefined || username === ''))) {
      return RemoteCommands.usage(protocol)
    }
    return {
      ok: true,
      request: {
        kind: 'remoteConnect',
        deviceId,
        protocol,
        targetIp: host,
        ...(username === undefined ? {} : { username }),
        ...(password === undefined ? {} : { password }),
      },
    }
  }

  /** What the finished request prints. */
  static outcome(network: NetworkState, record: RequestRecord): TerminalLine[] {
    const { request, result } = record
    if (request.kind !== 'remoteConnect') throw new Error(`Not a remote request: ${request.kind}`)
    const { protocol, targetIp } = request
    const outcome = result?.kind === 'remoteConnect' ? result.outcome : ({ ok: false, failure: 'timedOut', reason: 'requestTimedOut' } as const)
    const open = RemoteSessionLines.openLine(protocol, targetIp)
    if (outcome.ok) return [...open, ...RemoteSessionLines.opened(outcome)]
    if (outcome.failure !== 'authFailed') return RemoteSessionLines.failure(protocol, targetIp, outcome, null)
    const target = VtyAccess.deviceAt(network, targetIp)
    const lines = [
      ...open,
      ...RemoteSessionLines.loginPrompt(protocol),
      ...RemoteSessionLines.failure(protocol, targetIp, outcome, target === undefined ? null : VtyAccess.loginMode(target)),
    ]
    return request.password === undefined ? [...lines, messageLine(localizedMessage('remoteAccess:terminal.passwordHint'), 'info')] : lines
  }

  private static usage(protocol: RemoteProtocol): RemoteCommandParse {
    const key = protocol === 'ssh' ? 'remoteAccess:terminal.sshUsage' : 'remoteAccess:terminal.telnetUsage'
    return { ok: false, lines: [messageLine(localizedMessage(key), 'info')] }
  }
}
