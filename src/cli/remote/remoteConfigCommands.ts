// Global config of remote access (pack 5.2, docs/SECURITY_PACK.md §9): `ip domain-name` / `ip domain name`,
// `username … [privilege n] secret|password`, `ip ssh version|time-out|authentication-retries`.
// Help texts follow IOS 15 (`?` output); secrets are stored as typed and shown hashed (remoteConfigSections).
import type { LocalUser } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError, cliText } from '../core/CliOutput'
import { PasswordEncoding } from '../core/PasswordEncoding'
import { VtyAccess } from '../../sim/services/remote/VtyAccess'
import { RemoteEdits } from './RemoteEdits'

const MAX_PRIVILEGE = 15
const DEFAULT_PRIVILEGE = 1
const DEFAULT_TIMEOUT_SECONDS = 120
const MAX_TIMEOUT_SECONDS = 120
const DEFAULT_RETRIES = 3
const MAX_RETRIES = 5
/** Printed by `ip ssh version` while SSH is disabled (IOS; wording from show ip ssh, UNVERIFIED here). */
export const CREATE_KEYS_HINT = '%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).'

function domainName(ctx: CliContext): CliCommandResult {
  return { device: RemoteEdits.setManagement(ctx.device, 'domainName', ctx.args.text('domain')) }
}

function noDomainName(ctx: CliContext): CliCommandResult {
  return { device: RemoteEdits.setManagement(ctx.device, 'domainName', undefined) }
}

const domainNameNode = (word: string): CliNode =>
  keyword(word, 'Define the default domain name', {
    runNo: noDomainName,
    children: [param('domain', { type: 'word' }, 'Default domain name', { run: domainName, runNo: noDomainName })],
  })

/** The user being defined, with the privilege typed before the secret / password (absent = 1). */
function userOf(ctx: CliContext, credential: Pick<LocalUser, 'secret' | 'password'>): CliCommandResult {
  const privilege = ctx.args.has('privilege') ? ctx.args.number('privilege') : DEFAULT_PRIVILEGE
  const user: LocalUser = { name: ctx.args.text('user'), ...credential, ...(privilege === DEFAULT_PRIVILEGE ? {} : { privilege }) }
  return { device: RemoteEdits.putUser(ctx.device, user) }
}

function secretFromHash(ctx: CliContext): CliCommandResult {
  const secret = PasswordEncoding.decodeSecret5(ctx.args.text('hash'))
  if (secret === null) return { lines: cliError('ERROR: The secret you entered is not a valid encrypted secret.') }
  return userOf(ctx, { secret })
}

function passwordFromType7(ctx: CliContext): CliCommandResult {
  const password = PasswordEncoding.decodeType7(ctx.args.text('encrypted'))
  if (password === null) return { lines: cliError('Invalid encrypted password') }
  return userOf(ctx, { password })
}

const plainSecret = (ctx: CliContext) => userOf(ctx, { secret: ctx.args.text('secret') })
const plainPassword = (ctx: CliContext) => userOf(ctx, { password: ctx.args.text('password') })

/** `secret …` and `password …` after the user name (and after `privilege n`). */
function credentialNodes(): CliNode[] {
  return [
    keyword('password', 'Specify the password for the user', {
      children: [
        keyword('0', 'Specifies an UNENCRYPTED password will follow', {
          children: [param('password', { type: 'line' }, 'The UNENCRYPTED (cleartext) user password', { run: plainPassword })],
        }),
        keyword('7', 'Specifies a HIDDEN password will follow', {
          children: [param('encrypted', { type: 'word' }, 'The HIDDEN user password string', { run: passwordFromType7 })],
        }),
        param('password', { type: 'line' }, 'The UNENCRYPTED (cleartext) user password', { run: plainPassword }),
      ],
    }),
    keyword('secret', 'Specify the secret for the user', {
      children: [
        keyword('0', 'Specifies an UNENCRYPTED secret will follow', {
          children: [param('secret', { type: 'line' }, 'The UNENCRYPTED (cleartext) user secret', { run: plainSecret })],
        }),
        keyword('5', 'Specifies a MD5 HASHED secret will follow', {
          children: [param('hash', { type: 'word' }, 'The HASHED user secret string', { run: secretFromHash })],
        }),
        param('secret', { type: 'line' }, 'The UNENCRYPTED (cleartext) user secret', { run: plainSecret }),
      ],
    }),
  ]
}

const usernameNode = keyword('username', 'Establish User Name Authentication', {
  children: [
    param('user', { type: 'word' }, 'User name', {
      runNo: (ctx) => ({ device: RemoteEdits.removeUser(ctx.device, ctx.args.text('user')) }),
      children: [
        keyword('privilege', 'Set user privilege level', {
          children: [param('privilege', { type: 'number', min: 0, max: MAX_PRIVILEGE }, 'User privilege level', { children: credentialNodes() })],
        }),
        ...credentialNodes(),
      ],
    }),
  ],
})

/** `ip ssh version n`; IOS reminds that SSH stays off until keys exist. */
function sshVersion(ctx: CliContext): CliCommandResult {
  const version = ctx.args.number('version') === 1 ? 1 : 2
  const device = RemoteEdits.setSsh(ctx.device, 'version', version)
  return VtyAccess.sshEnabled(device) ? { device } : { device, lines: cliText(CREATE_KEYS_HINT) }
}

function sshNumber(key: 'timeoutSeconds' | 'authRetries', name: string, byDefault: number) {
  return (ctx: CliContext): CliCommandResult => {
    const value = ctx.args.number(name)
    return { device: RemoteEdits.setSsh(ctx.device, key, value === byDefault ? undefined : value) }
  }
}

const sshNode = keyword('ssh', 'Configure ssh options', {
  children: [
    keyword('version', 'Specify protocol version supported', {
      runNo: (ctx) => ({ device: RemoteEdits.setSsh(ctx.device, 'version', undefined) }),
      children: [param('version', { type: 'number', min: 1, max: 2 }, 'Protocol version', { run: sshVersion })],
    }),
    keyword('time-out', 'Specify SSH time-out interval', {
      runNo: (ctx) => ({ device: RemoteEdits.setSsh(ctx.device, 'timeoutSeconds', undefined) }),
      children: [
        param('seconds', { type: 'number', min: 1, max: MAX_TIMEOUT_SECONDS }, 'SSH time-out interval (secs)', {
          run: sshNumber('timeoutSeconds', 'seconds', DEFAULT_TIMEOUT_SECONDS),
        }),
      ],
    }),
    keyword('authentication-retries', 'Specify number of authentication retries', {
      runNo: (ctx) => ({ device: RemoteEdits.setSsh(ctx.device, 'authRetries', undefined) }),
      children: [
        param('retries', { type: 'number', min: 0, max: MAX_RETRIES }, 'Number of authentication retries', {
          run: sshNumber('authRetries', 'retries', DEFAULT_RETRIES),
        }),
      ],
    }),
  ],
})

export const SSH_DEFAULTS = { timeoutSeconds: DEFAULT_TIMEOUT_SECONDS, authRetries: DEFAULT_RETRIES } as const

export const remoteConfigCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        domainNameNode('domain-name'),
        keyword('domain', 'IP DNS Resolver', { children: [domainNameNode('name')] }),
        sshNode,
      ],
    }),
  },
  { modes: ['globalConfig'], node: usernameNode },
]
