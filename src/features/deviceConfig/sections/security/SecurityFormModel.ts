// Draft, validation and apply of the remote-access card (pack 5.2): domain name, SSH server, vty login and
// transport, local users. Same storage rules as the CLI (src/cli/remote): factory values are absent keys.
import type { LineSettings, LocalUser, ManagementSettings, SshSettings, VtyTransport } from '../../../../domain'
import type { LocalizedMessage } from '../../../../domain/Messages'
import { localizedMessage } from '../../../../i18n/messageKeys'
import { DnsServiceFormModel } from '../../model/DnsServiceFormModel'
import { anyRowErrors, type FieldErrors, hasErrors, newRowKey, parseWholeNumber, pick } from '../../model/formTypes'

export const SSH_VERSIONS = ['both', '1', '2'] as const
export const TRANSPORTS = ['all', 'ssh', 'telnet', 'none'] as const
export const LOGIN_MODES = ['line', 'local', 'none'] as const
export const CREDENTIAL_KINDS = ['secret', 'password'] as const

export type SshVersionChoice = (typeof SSH_VERSIONS)[number]
export type TransportChoice = (typeof TRANSPORTS)[number]
export type LoginChoice = (typeof LOGIN_MODES)[number]
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

export interface UserDraft {
  key: string
  name: string
  privilege: string
  kind: CredentialKind
  credential: string
}

export interface SecurityDraft {
  domainName: string
  /** '' = no RSA keys. */
  keyBits: string
  sshVersion: SshVersionChoice
  timeout: string
  retries: string
  transport: TransportChoice
  login: LoginChoice
  linePassword: string
  users: UserDraft[]
}

export type SecurityField = 'domainName' | 'keyBits' | 'timeout' | 'retries'
export type UserField = 'name' | 'privilege' | 'credential'

export interface SecurityErrors {
  fields: FieldErrors<SecurityField>
  users: FieldErrors<UserField>[]
}

const DEFAULT_TIMEOUT = 120
const DEFAULT_RETRIES = 3
const DEFAULT_PRIVILEGE = 1
const MIN_BITS = 360
const MAX_BITS = 4096
const USER_NAME = /^\S+$/

function transportOf(transports: readonly VtyTransport[] | undefined): TransportChoice {
  if (transports === undefined || transports.length === 2) return 'all'
  return transports[0] ?? 'none'
}

function transportsOf(choice: TransportChoice): VtyTransport[] | undefined {
  if (choice === 'all') return undefined
  return choice === 'none' ? [] : [choice]
}

function loginOf(vty: LineSettings): LoginChoice {
  if (vty.loginLocal === true) return 'local'
  return vty.login ?? true ? 'line' : 'none'
}

function range(min: number, max: number): LocalizedMessage {
  return localizedMessage('remoteAccess:errors.range', { min, max })
}

/** The value, or undefined when it equals the factory value (absent key). */
function unlessDefault(value: number, byDefault: number): number | undefined {
  return value === byDefault ? undefined : value
}

function definedOnly<Value extends object>(value: Value): Value | undefined {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  return entries.length === 0 ? undefined : (Object.fromEntries(entries) as Value)
}

export class SecurityFormModel {
  static toDraft(management: ManagementSettings): SecurityDraft {
    const ssh = management.ssh ?? {}
    const vty = management.lines?.vty ?? {}
    return {
      domainName: management.domainName ?? '',
      keyBits: ssh.rsaKeyBits === undefined ? '' : String(ssh.rsaKeyBits),
      sshVersion: ssh.version === undefined ? 'both' : ssh.version === 1 ? '1' : '2',
      timeout: String(ssh.timeoutSeconds ?? DEFAULT_TIMEOUT),
      retries: String(ssh.authRetries ?? DEFAULT_RETRIES),
      transport: transportOf(vty.transportInput),
      login: loginOf(vty),
      linePassword: vty.password ?? '',
      users: (management.users ?? []).map((user) => ({
        key: newRowKey(),
        name: user.name,
        privilege: String(user.privilege ?? DEFAULT_PRIVILEGE),
        kind: user.secret === undefined ? 'password' : 'secret',
        credential: user.secret ?? user.password ?? '',
      })),
    }
  }

  /** Select values back to their typed choices (an unknown value = the default). */
  static sshVersion(value: string): SshVersionChoice {
    return pick(SSH_VERSIONS, value) ?? 'both'
  }

  static transport(value: string): TransportChoice {
    return pick(TRANSPORTS, value) ?? 'all'
  }

  static login(value: string): LoginChoice {
    return pick(LOGIN_MODES, value) ?? 'line'
  }

  static credentialKind(value: string): CredentialKind {
    return pick(CREDENTIAL_KINDS, value) ?? 'secret'
  }

  static newUser(): UserDraft {
    return { key: newRowKey(), name: '', privilege: String(DEFAULT_PRIVILEGE), kind: 'secret', credential: '' }
  }

  static validate(draft: SecurityDraft): SecurityErrors {
    const fields: FieldErrors<SecurityField> = {}
    const domain = draft.domainName.trim()
    if (domain !== '' && !DnsServiceFormModel.isHostName(domain)) fields.domainName = localizedMessage('deviceConfig:errors.hostName')
    if (draft.keyBits.trim() !== '') {
      if (parseWholeNumber(draft.keyBits, MIN_BITS, MAX_BITS) === null) fields.keyBits = range(MIN_BITS, MAX_BITS)
      else if (domain === '') fields.keyBits = localizedMessage('remoteAccess:errors.keysNeedDomain')
    }
    if (parseWholeNumber(draft.timeout, 1, DEFAULT_TIMEOUT) === null) fields.timeout = range(1, DEFAULT_TIMEOUT)
    if (parseWholeNumber(draft.retries, 0, 5) === null) fields.retries = range(0, 5)
    const seen = new Set<string>()
    const users = draft.users.map((user) => {
      const errors: FieldErrors<UserField> = {}
      const name = user.name.trim()
      if (name === '') errors.name = localizedMessage('deviceConfig:errors.required')
      else if (!USER_NAME.test(name)) errors.name = localizedMessage('remoteAccess:errors.userName')
      else if (seen.has(name)) errors.name = localizedMessage('deviceConfig:errors.duplicateName', { name })
      seen.add(name)
      if (parseWholeNumber(user.privilege, 0, 15) === null) errors.privilege = range(0, 15)
      if (user.credential === '') errors.credential = localizedMessage('deviceConfig:errors.required')
      return errors
    })
    return { fields, users }
  }

  static isValid(errors: SecurityErrors): boolean {
    return !hasErrors(errors.fields) && !anyRowErrors(errors.users)
  }

  /** The management settings after the draft (only call when valid). Other vty fields are kept. */
  static apply(management: ManagementSettings, draft: SecurityDraft): ManagementSettings {
    const vty: LineSettings = { ...management.lines?.vty }
    delete vty.login
    delete vty.loginLocal
    delete vty.transportInput
    delete vty.password
    const password = draft.linePassword === '' ? undefined : draft.linePassword
    const transportInput = transportsOf(draft.transport)
    const nextVty = definedOnly<LineSettings>({
      ...vty,
      password,
      transportInput,
      login: draft.login === 'none' ? false : undefined,
      loginLocal: draft.login === 'local' ? true : undefined,
    })
    const lines = definedOnly({ ...management.lines, vty: nextVty })
    const version = pick(SSH_VERSIONS, draft.sshVersion)
    const ssh = definedOnly<SshSettings>({
      rsaKeyBits: draft.keyBits.trim() === '' ? undefined : Number(draft.keyBits),
      version: version === '1' ? 1 : version === '2' ? 2 : undefined,
      timeoutSeconds: unlessDefault(Number(draft.timeout), DEFAULT_TIMEOUT),
      authRetries: unlessDefault(Number(draft.retries), DEFAULT_RETRIES),
    })
    const users = draft.users.map((user): LocalUser => {
      const privilege = Number(user.privilege)
      return {
        name: user.name.trim(),
        [user.kind]: user.credential,
        ...(privilege === DEFAULT_PRIVILEGE ? {} : { privilege }),
      }
    })
    return definedOnly<ManagementSettings>({
      ...management,
      domainName: draft.domainName.trim() === '' ? undefined : draft.domainName.trim(),
      ssh,
      users: users.length === 0 ? undefined : users,
      lines,
    }) ?? {}
  }
}
