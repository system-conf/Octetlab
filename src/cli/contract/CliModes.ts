// IOS command modes of a CLI session (docs/CLI.md §2). Plain data: the session state keeps the mode.

/** `line con 0` / `line vty 0 4`. Pack 5.2 may add 'aux'. */
export type CliLineType = 'console' | 'vty'

export type CliMode =
  /** `Router>` */
  | { readonly kind: 'userExec' }
  /** `Router#` */
  | { readonly kind: 'privilegedExec' }
  /** `Router(config)#` */
  | { readonly kind: 'globalConfig' }
  /** `Router(config-if)#`: a switched / routed port id ('Gi0/0') or an SVI id ('Vlan10'). */
  | { readonly kind: 'interface'; readonly interfaceId: string }
  /**
   * `Router(config-subif)#`: '<parent port id>.<n>'. The sub-interface itself is created by the first
   * command that needs it (`encapsulation dot1Q`, C3), so the id may not exist on the device yet.
   */
  | { readonly kind: 'subInterface'; readonly interfaceId: string }
  /** `Switch(config-if-range)#`: commands of the interface mode run once per member, in order. */
  | { readonly kind: 'interfaceRange'; readonly interfaceIds: readonly string[] }
  /** `Router(config-line)#` */
  | { readonly kind: 'line'; readonly lineType: CliLineType; readonly first: number; readonly last: number }
  /** `Switch(config-vlan)#`: `vlan 10` or `vlan 10,20,30-35`. */
  | { readonly kind: 'vlan'; readonly vlanIds: readonly number[] }
  /** `Router(dhcp-config)#`: `ip dhcp pool <poolId>`. */
  | { readonly kind: 'dhcpPool'; readonly poolId: string }
  /** `Router(config-router)#`: reserved for the routing packs (5.3); `protocol` e.g. 'ospf', 'rip'. */
  | { readonly kind: 'router'; readonly protocol: string; readonly processId: number | null }
  /**
   * Pack 5.2: `ip access-list standard|extended <name>` → `Router(config-std-nacl)#` /
   * `Router(config-ext-nacl)#`. The list itself is created by the command that enters the mode.
   */
  | { readonly kind: 'accessList'; readonly listType: 'standard' | 'extended'; readonly name: string }
  /**
   * Firewall pack (docs/FIREWALL_PACK.md §6): `object network <name>` → `Firewall(config-network-object)#`.
   * Holds `host` / `subnet` and the object's `nat (in,out) …` line; created by the entering command.
   */
  | { readonly kind: 'objectNetwork'; readonly name: string }

export type CliModeKind = CliMode['kind']

/** Every mode, in the order docs/CLI.md lists them. */
export const CLI_MODE_KINDS: readonly CliModeKind[] = [
  'userExec',
  'privilegedExec',
  'globalConfig',
  'interface',
  'subInterface',
  'interfaceRange',
  'line',
  'vlan',
  'dhcpPool',
  'router',
  'accessList',
  'objectNetwork',
]

/** The EXEC modes (no `(config…)` in the prompt). */
export const EXEC_MODE_KINDS: readonly CliModeKind[] = ['userExec', 'privilegedExec']

/** Config sub-modes: `exit` goes back to global config, unknown commands fall back to global config. */
export const CONFIG_SUBMODE_KINDS: readonly CliModeKind[] = [
  'interface',
  'subInterface',
  'interfaceRange',
  'line',
  'vlan',
  'dhcpPool',
  'router',
  'accessList',
  'objectNetwork',
]

/** Every config mode (global config and its sub-modes): `do`, `end` and Ctrl+Z work here. */
export const CONFIG_MODE_KINDS: readonly CliModeKind[] = ['globalConfig', ...CONFIG_SUBMODE_KINDS]
