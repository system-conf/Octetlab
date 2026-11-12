// Remote-access command set (pack 5.2, owner: agent C; docs/SECURITY_PACK.md §9): `ip domain-name`,
// `username`, `crypto key generate rsa`, `ip ssh …`, vty `transport input` / `login local`,
// `show ip ssh` / `show ssh` / `show users` / `show crypto key mypubkey rsa`, `ssh -l` / `telnet` from
// routers and switches. The vty `access-class` command is agent A's (src/cli/acl); the line block prints it.
import type { CliCommandSet } from '../contract'
import { cryptoCommands } from './cryptoCommands'
import { remoteClientCommands } from './remoteClientCommands'
import { remoteConfigCommands } from './remoteConfigCommands'
import { remoteConfigSections } from './remoteConfigSections'
import { remoteLineCommands } from './remoteLineCommands'
import { remoteShowCommands } from './remoteShowCommands'

export const REMOTE_ACCESS_COMMAND_SET_ID = 'remoteAccess'

export const remoteAccessCommandSet: CliCommandSet = {
  id: REMOTE_ACCESS_COMMAND_SET_ID,
  commands: [...remoteConfigCommands, ...cryptoCommands, ...remoteLineCommands, ...remoteShowCommands, ...remoteClientCommands],
  configSections: remoteConfigSections,
  interfaceLines: [],
}
