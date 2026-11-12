// ACL command set (pack 5.2, owner: agent A; docs/SECURITY_PACK.md §7): `access-list`,
// `ip access-list …` and its sub-mode, `ip access-group`, `access-class`, `show access-lists`.
// Registered by the coordinator in src/cli/commandSets.ts; agent A fills the arrays.
import type { CliCommandSet } from '../contract'

export const ACL_COMMAND_SET_ID = 'acl'

export const aclCommandSet: CliCommandSet = {
  id: ACL_COMMAND_SET_ID,
  commands: [],
  configSections: [],
  interfaceLines: [],
}
