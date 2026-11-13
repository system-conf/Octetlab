// Firewall command set (owner: agent B; docs/FIREWALL_PACK.md §6): interface `nameif` / `security-level`,
// `same-security-traffic`, `object network` + `host|subnet` + `nat`, `access-list <name> extended …`,
// `access-group … interface …`, `route`, `timeout`, `inspect icmp`, `show conn|xlate|nameif|route|interface ip
// brief`, `clear conn|xlate`, `packet-tracer`. Every node is limited to devices of kind 'firewall', so
// routers and switches keep their command trees. Registered by the coordinator in src/cli/commandSets.ts.
import type { CliCommandSet } from '../contract'
import { firewallAccessListCommands } from './firewallAccessListCommands'
import { firewallConfigSections, firewallInterfaceLines } from './firewallConfigSections'
import { firewallExecCommands } from './firewallExecCommands'
import { firewallGlobalCommands } from './firewallGlobalCommands'
import { firewallInterfaceCommands } from './firewallInterfaceCommands'
import { firewallObjectCommands } from './firewallObjectCommands'

export const FIREWALL_COMMAND_SET_ID = 'firewall'

export const firewallCommandSet: CliCommandSet = {
  id: FIREWALL_COMMAND_SET_ID,
  commands: [...firewallInterfaceCommands, ...firewallGlobalCommands, ...firewallAccessListCommands, ...firewallObjectCommands, ...firewallExecCommands],
  configSections: firewallConfigSections,
  interfaceLines: firewallInterfaceLines,
}
