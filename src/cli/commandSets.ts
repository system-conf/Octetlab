// The command sets the app's CLI loads besides the core one, in registration order (docs/CLI.md §8).
// Owned by the integrator (CI): `switchCommandSet` (C2, src/cli/switch) and `routerCommandSet`
// (C3, src/cli/router); C2 / C3 never edit this file and test with `new CliShell([theirSet])`.
// The router set owns interface `ip address` (also for SVIs), so the switch set without it is used.
// Pack 5.2 (docs/SECURITY_PACK.md): acl (agent A), nat (agent B), remoteAccess (agent C).
// Firewall pack (docs/FIREWALL_PACK.md): firewall (agent B).
import { aclCommandSet } from './acl'
import type { CliCommandSet } from './contract'
import { firewallCommandSet } from './firewall'
import { natCommandSet } from './nat'
import { remoteAccessCommandSet } from './remote'
import { routerCommandSet } from './router'
import { switchCommandSet } from './switch'

export const CLI_COMMAND_SETS: readonly CliCommandSet[] = [
  switchCommandSet,
  routerCommandSet,
  aclCommandSet,
  natCommandSet,
  remoteAccessCommandSet,
  firewallCommandSet,
]
