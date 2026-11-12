// NAT command set (pack 5.2, owner: agent B; docs/SECURITY_PACK.md §8): `ip nat pool`,
// `ip nat inside source …`, interface `ip nat inside|outside`, `show ip nat translations|statistics`,
// `clear ip nat translation *`. Registered by the coordinator in src/cli/commandSets.ts.
import type { CliCommandSet } from '../contract'
import { natConfigSections, natInterfaceLines } from './natConfigSections'
import { natGlobalCommands } from './natGlobalCommands'
import { natInterfaceCommands } from './natInterfaceCommands'
import { natShowCommands } from './natShowCommands'

export const NAT_COMMAND_SET_ID = 'nat'

export const natCommandSet: CliCommandSet = {
  id: NAT_COMMAND_SET_ID,
  commands: [...natGlobalCommands, ...natInterfaceCommands, ...natShowCommands],
  configSections: natConfigSections,
  interfaceLines: natInterfaceLines,
}
