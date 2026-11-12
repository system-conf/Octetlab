// ACL command set (pack 5.2, owner: agent A; docs/SECURITY_PACK.md §7): `access-list`,
// `ip access-list …` and its sub-mode, `ip access-group`, `access-class`, `show access-lists`.
// Registered by the coordinator in src/cli/commandSets.ts.
import type { CliCommandSet } from '../contract'
import { aclBindingCommands } from './aclBindingCommands'
import { aclConfigSections, aclInterfaceLines } from './aclConfigSections'
import { aclListCommands } from './aclListCommands'
import { aclShowCommands } from './aclShowCommands'

export const ACL_COMMAND_SET_ID = 'acl'

export const aclCommandSet: CliCommandSet = {
  id: ACL_COMMAND_SET_ID,
  commands: [...aclListCommands, ...aclBindingCommands, ...aclShowCommands],
  configSections: aclConfigSections,
  interfaceLines: aclInterfaceLines,
}
