// Firewall command set (owner: agent B; docs/FIREWALL_PACK.md §6): interface `nameif` /
// `security-level`, `same-security-traffic permit …`, `object network` + `host|subnet` + `nat`,
// `access-group … in|out interface …`, `show conn`, `show nameif`, `clear conn`, `packet-tracer`.
// Prelude: empty set, registered by the coordinator in src/cli/commandSets.ts. Running-config slots:
// 55 (interface lines) and 76 (global sections).
import type { CliCommandSet } from '../contract'

export const FIREWALL_COMMAND_SET_ID = 'firewall'

export const firewallCommandSet: CliCommandSet = {
  id: FIREWALL_COMMAND_SET_ID,
  commands: [],
}
