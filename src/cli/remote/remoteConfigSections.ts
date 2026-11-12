// Running-config output of remote access (pack 5.2). IOS 15.1 order: `ip domain-name` with the global
// `ip` switches, then `username …`, then `ip ssh …`, before the interfaces. RSA keys are not part of
// running-config (they live in NVRAM). Secrets are shown hashed (`secret 5`), passwords as typed or type 7
// with `service password-encryption`; every line is read back by remoteConfigCommands (startup replay).
import type { LocalUser } from '../../domain'
import type { RunningConfigSection } from '../contract'
import { RUNNING_CONFIG_ORDER } from '../contract'
import { managementOf } from '../core/CliPrompt'
import { PasswordEncoding } from '../core/PasswordEncoding'

/** Free slots after the global `ip` switches (50) and before spanning-tree (55); NAT may use 51. */
const USERS_ORDER = RUNNING_CONFIG_ORDER.ipGlobal + 2
const IP_SSH_ORDER = RUNNING_CONFIG_ORDER.ipGlobal + 3

function userLine(user: LocalUser, encrypted: boolean): string {
  const privilege = user.privilege === undefined ? '' : ` privilege ${user.privilege}`
  if (user.secret !== undefined) return `username ${user.name}${privilege} secret 5 ${PasswordEncoding.secret5(user.secret)}`
  const password = user.password ?? ''
  return `username ${user.name}${privilege} password ${encrypted ? `7 ${PasswordEncoding.type7(password)}` : `0 ${password}`}`
}

const domainNameSection: RunningConfigSection = {
  id: 'domainName',
  order: RUNNING_CONFIG_ORDER.ipGlobal,
  blocks: (device) => {
    const domain = managementOf(device).domainName
    return domain === undefined ? [] : [[`ip domain-name ${domain}`]]
  },
}

const usersSection: RunningConfigSection = {
  id: 'users',
  order: USERS_ORDER,
  blocks: (device) => {
    const management = managementOf(device)
    const users = management.users ?? []
    return users.length === 0 ? [] : [users.map((user) => userLine(user, management.passwordEncryption === true))]
  },
}

const ipSshSection: RunningConfigSection = {
  id: 'ipSsh',
  order: IP_SSH_ORDER,
  blocks: (device) => {
    const ssh = managementOf(device).ssh
    const lines = [
      ...(ssh?.timeoutSeconds === undefined ? [] : [`ip ssh time-out ${ssh.timeoutSeconds}`]),
      ...(ssh?.authRetries === undefined ? [] : [`ip ssh authentication-retries ${ssh.authRetries}`]),
      ...(ssh?.version === undefined ? [] : [`ip ssh version ${ssh.version}`]),
    ]
    return lines.length === 0 ? [] : [lines]
  },
}

export const remoteConfigSections: readonly RunningConfigSection[] = [domainNameSection, usersSection, ipSshSection]
