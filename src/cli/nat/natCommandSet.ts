// NAT command set (pack 5.2, owner: agent B; docs/SECURITY_PACK.md §8): `ip nat pool`,
// `ip nat inside source …`, interface `ip nat inside|outside`, `show ip nat translations|statistics`,
// `clear ip nat translation *`. Registered by the coordinator; agent B fills the arrays.
import type { CliCommandSet } from '../contract'

export const NAT_COMMAND_SET_ID = 'nat'

export const natCommandSet: CliCommandSet = {
  id: NAT_COMMAND_SET_ID,
  commands: [],
  configSections: [],
  interfaceLines: [],
}
