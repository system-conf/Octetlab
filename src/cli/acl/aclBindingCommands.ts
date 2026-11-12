// ACL bindings (pack 5.2, docs/SECURITY_PACK.md §7): `ip access-group <acl> in|out` on routed ports,
// sub-interfaces and SVIs (L3Features.accessGroups), and `access-class <acl> in|out` on the vty lines
// (LineSettings.accessClass; agent C prints that line in the `line vty` block and enforces it).
// A binding may name a list that does not exist yet: it then permits all (SECURITY_PACK.md §2.4).
import type { AclBinding, L3Features, L3Settings, LineSettings } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliKeywordNode } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliError, cliMessage } from '../core/CliOutput'
import { DeviceEdits } from '../core/DeviceEdits'
import { RouterEdits } from '../router/RouterEdits'
import { AclInterfaces } from './AclInterfaces'

type Direction = 'in' | 'out'

const SUBIF_WITHOUT_VLAN = [
  '% Configuring IP routing on a LAN subinterface is only allowed if that',
  'subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,',
  'or ISL vLAN.',
]

/** The binding with `direction` set to `name` (undefined removes it); undefined when nothing is bound. */
export function withDirection(binding: AclBinding | undefined, direction: Direction, name: string | undefined): AclBinding | undefined {
  const next: AclBinding = { ...binding }
  if (name === undefined) delete next[direction]
  else next[direction] = name
  return next.in === undefined && next.out === undefined ? undefined : next
}

function withGroups(l3: L3Settings, groups: AclBinding | undefined): L3Settings {
  const features: L3Features = { ...l3.features }
  if (groups === undefined) delete features.accessGroups
  else features.accessGroups = groups
  const next: L3Settings = { ...l3 }
  delete next.features
  return Object.keys(features).length === 0 ? next : { ...next, features }
}

// ---------------------------------------------------------------- ip access-group

function bindGroup(ctx: CliContext, direction: Direction, name: string | undefined): CliCommandResult {
  const iface = RouterEdits.current(ctx)
  if (iface === undefined) return { lines: cliError(...SUBIF_WITHOUT_VLAN) }
  if (iface.kind === 'port' && iface.port.role === 'switched') return { lines: [cliMessage(localizedMessage('acl:cli.switchportGroup'))] }
  const current = AclInterfaces.l3Of(iface)?.features?.accessGroups
  // `no ip access-group <other> in` leaves a different binding alone (only the named list is removed).
  if (name === undefined && ctx.args.has('acl') && current?.[direction] !== ctx.args.text('acl')) return {}
  return { device: DeviceEdits.updateL3(ctx.device, iface.id, (l3) => withGroups(l3, withDirection(l3.features?.accessGroups, direction, name))) }
}

function directions(bind: (ctx: CliContext, direction: Direction, remove: boolean) => CliCommandResult, what: string): CliKeywordNode[] {
  const node = (direction: Direction, help: string) =>
    keyword(direction, help, { run: (ctx) => bind(ctx, direction, false), runNo: (ctx) => bind(ctx, direction, true) })
  return [node('in', `inbound ${what}`), node('out', `outbound ${what}`)]
}

function groupHandler(ctx: CliContext, direction: Direction, remove: boolean): CliCommandResult {
  return bindGroup(ctx, direction, remove ? undefined : ctx.args.text('acl'))
}

// ---------------------------------------------------------------- access-class (line vty)

function updateVty(ctx: CliContext, change: (settings: LineSettings) => LineSettings): CliCommandResult {
  const device = DeviceEdits.updateManagement(ctx.device, (management) => {
    const lines = { ...management.lines }
    const vty = change({ ...lines.vty })
    if (Object.keys(vty).length === 0) delete lines.vty
    else lines.vty = vty
    const next = { ...management }
    if (Object.keys(lines).length === 0) delete next.lines
    else next.lines = lines
    return next
  })
  return { device }
}

function classHandler(ctx: CliContext, direction: Direction, remove: boolean): CliCommandResult {
  if (ctx.mode.kind !== 'line' || ctx.mode.lineType !== 'vty') return { lines: [cliMessage(localizedMessage('acl:cli.vtyOnly'))] }
  const current = ctx.device.features?.management?.lines?.vty?.accessClass
  if (remove && ctx.args.has('acl') && current?.[direction] !== ctx.args.text('acl')) return {}
  const name = remove ? undefined : ctx.args.text('acl')
  return updateVty(ctx, (settings) => {
    const accessClass = withDirection(settings.accessClass, direction, name)
    const next: LineSettings = { ...settings }
    if (accessClass === undefined) delete next.accessClass
    else next.accessClass = accessClass
    return next
  })
}

function bindingTree(word: string, help: string, handler: (ctx: CliContext, direction: Direction, remove: boolean) => CliCommandResult, what: string): CliKeywordNode {
  // `no ip access-group in` (without the list) is accepted too; a list named "in" / "out" is not possible then.
  const bare = directions(handler, what).map((node) => keyword(node.word, node.help, node.runNo === undefined ? {} : { runNo: node.runNo }))
  return keyword(word, help, {
    children: [
      ...bare,
      param('acl', { type: 'word', label: 'WORD' }, 'IP access list name or number', { children: directions(handler, what) }),
    ],
  })
}

export const aclBindingCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface', 'subInterface'],
    node: keyword('ip', 'Interface Internet Protocol config commands', {
      children: [{ ...bindingTree('access-group', 'Specify access control for packets', groupHandler, 'packets'), when: CliWhens.routing }],
    }),
  },
  {
    modes: ['line'],
    node: bindingTree('access-class', 'Filter connections based on an IP access list', classHandler, 'connections'),
  },
]
