// `ssh -l <user> <host>` and `telnet <host>` from a router or switch (pack 5.2, scope A). Two simulator
// jobs, like IOS's order on screen: connect first (refused, timed out, "Password required, but none
// set" end there), then the credentials are asked and a second attempt logs in. The remote prompt is not
// simulated: a successful login ends with a hint (docs/SECURITY_PACK.md §2.2).
import { Ipv4 } from '../../net/Ipv4'
import type { RemoteConnectOutcome, RequestRecord } from '../../sim/contract'
import { VtyAccess } from '../../sim/services/remote/VtyAccess'
import { RemoteSessionLines } from '../../sim/terminal/RemoteSessionLines'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliQuestion } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'

type Protocol = 'ssh' | 'telnet'

/** IOS answer to a target it cannot turn into an address (names are not resolved by these clients here). */
const UNKNOWN_HOST = '% Unknown command or computer name, or unable to find computer address'
const TIMED_OUT: RemoteConnectOutcome = { ok: false, failure: 'timedOut', reason: 'requestTimedOut' }

interface Attempt {
  readonly protocol: Protocol
  readonly ip: string
  readonly username?: string
}

function outcomeOf(record: RequestRecord): RemoteConnectOutcome {
  return record.result?.kind === 'remoteConnect' ? record.result.outcome : TIMED_OUT
}

function loginModeOf(ctx: CliContext, ip: string) {
  const target = VtyAccess.deviceAt(ctx.env.network, ip)
  return target === undefined ? null : VtyAccess.loginMode(target)
}

/** The second attempt, with the credentials typed at the prompts. */
function login(attempt: Attempt, password: string, ctx: CliContext): CliCommandResult {
  const { protocol, ip, username } = attempt
  return {
    job: {
      request: { kind: 'remoteConnect', deviceId: ctx.device.id, protocol, targetIp: ip, password, ...(username === undefined ? {} : { username }) },
      onDone: (record, doneCtx) => {
        const outcome = outcomeOf(record)
        if (outcome.ok) return { lines: RemoteSessionLines.opened(outcome) }
        return { lines: RemoteSessionLines.failure(protocol, ip, outcome, loginModeOf(doneCtx, ip)) }
      },
    },
  }
}

function passwordQuestion(attempt: Attempt): CliQuestion {
  return { prompt: 'Password: ', secret: true, onAnswer: (answer, ctx) => login(attempt, answer, ctx) }
}

const usernameQuestion = (attempt: Attempt): CliQuestion => ({
  prompt: 'Username: ',
  secret: false,
  onAnswer: (answer) => ({ ask: passwordQuestion({ ...attempt, username: answer.trim() }) }),
})

/** The first attempt: connect with the user name only (ssh `-l`), then ask what the vty wants. */
function connect(ctx: CliContext, attempt: Attempt): CliCommandResult {
  const { protocol, ip, username } = attempt
  return {
    job: {
      request: { kind: 'remoteConnect', deviceId: ctx.device.id, protocol, targetIp: ip, ...(username === undefined ? {} : { username }) },
      onDone: (record, doneCtx) => {
        const outcome = outcomeOf(record)
        const open = RemoteSessionLines.openLine(protocol, ip)
        if (outcome.ok) return { lines: [...open, ...RemoteSessionLines.opened(outcome)] }
        if (outcome.failure !== 'authFailed') return { lines: RemoteSessionLines.failure(protocol, ip, outcome, null) }
        const askUser = protocol === 'telnet' && loginModeOf(doneCtx, ip) === 'local'
        return { lines: [...open, ...RemoteSessionLines.loginPrompt(protocol)], ask: askUser ? usernameQuestion(attempt) : passwordQuestion(attempt) }
      },
    },
  }
}

function target(ctx: CliContext): string | null {
  const host = ctx.args.text('host')
  return Ipv4.isValid(host) ? host : null
}

function ssh(ctx: CliContext): CliCommandResult {
  const ip = target(ctx)
  if (ip === null) return { lines: cliError(UNKNOWN_HOST) }
  return connect(ctx, { protocol: 'ssh', ip, username: ctx.args.text('user') })
}

function telnet(ctx: CliContext): CliCommandResult {
  const ip = target(ctx)
  if (ip === null) return { lines: cliError(UNKNOWN_HOST) }
  return connect(ctx, { protocol: 'telnet', ip })
}

const hostNode = param('host', { type: 'word', label: 'WORD' }, 'IP address or hostname of a remote system', { run: ssh })
const userNode = keyword('-l', 'Log in using this user name', {
  children: [param('user', { type: 'word', label: 'WORD' }, 'Login name', { children: [hostNode] })],
})

export const remoteClientCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('ssh', 'Open a secure shell client connection', {
      children: [
        userNode,
        keyword('-v', 'Specify SSH Protocol Version', {
          children: [param('sshVersion', { type: 'number', min: 1, max: 2 }, 'Protocol Version', { children: [userNode] })],
        }),
      ],
    }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('telnet', 'Open a telnet connection', {
      children: [param('host', { type: 'word', label: 'WORD' }, 'IP address or hostname of a remote system', { run: telnet })],
    }),
  },
]
