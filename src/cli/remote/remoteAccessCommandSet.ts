// Remote-access command set (pack 5.2, owner: agent C; docs/SECURITY_PACK.md §9): `ip domain-name`,
// `username`, `crypto key generate rsa`, `ip ssh …`, vty `transport input` / `login local`,
// `show ip ssh`, `ssh -l` / `telnet` from routers. Registered by the coordinator; agent C fills it.
import type { CliCommandSet } from '../contract'

export const REMOTE_ACCESS_COMMAND_SET_ID = 'remoteAccess'

export const remoteAccessCommandSet: CliCommandSet = {
  id: REMOTE_ACCESS_COMMAND_SET_ID,
  commands: [],
  configSections: [],
  interfaceLines: [],
}
