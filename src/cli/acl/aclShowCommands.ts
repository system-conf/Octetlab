// ACL show / clear commands (pack 5.2, docs/SECURITY_PACK.md §7): `show access-lists [<acl>]`,
// `show ip access-lists [<acl>]`, `show ip interface [<interface>]` and `clear access-list counters`.
// Hit counters live in the simulator runtime (extensions.aclCounters); without a running simulation the
// lists print without counts.
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliText } from '../core/CliOutput'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { AccessListsView } from './AccessListsView'
import { AclEdits } from './AclEdits'
import { IpInterfaceView } from './IpInterfaceView'

function showLists(ctx: CliContext): CliCommandResult {
  const only = ctx.args.has('acl') ? ctx.args.text('acl') : null
  return { lines: cliText(...AccessListsView.lines(AclEdits.listsOf(ctx.device), ctx.env.runtime?.extensions?.aclCounters, only)) }
}

function showInterfaces(ctx: CliContext): CliCommandResult {
  if (!ctx.args.has('interface')) return { lines: cliText(...IpInterfaceView.lines(ctx.env.network, ctx.device, null)) }
  const iface = DeviceInterfaces.resolve(ctx.device, ctx.args.interface('interface'))
  // IOS prints nothing for an interface the device does not have (the parser already refused unknown types).
  if (iface === undefined) return {}
  return { lines: cliText(...IpInterfaceView.lines(ctx.env.network, ctx.device, iface.id)) }
}

function clearCounters(ctx: CliContext): CliCommandResult {
  return { job: { request: { kind: 'clearTable', deviceId: ctx.device.id, table: 'aclCounters' }, onDone: () => ({}) } }
}

function listsNode(help: string): CliNode {
  return keyword('access-lists', help, {
    when: CliWhens.routing,
    run: showLists,
    children: [param('acl', { type: 'word', label: 'WORD' }, 'ACL name or number', { run: showLists })],
  })
}

export const aclShowCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [
        listsNode('List access lists'),
        keyword('ip', 'IP information', {
          children: [
            listsNode('List IP access lists'),
            // Merged with the router set's `show ip interface brief`; switches show their SVIs too.
            keyword('interface', 'IP interface status and configuration', {
              run: showInterfaces,
              children: [param('interface', { type: 'interface' }, 'Interface', { run: showInterfaces })],
            }),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['privilegedExec'],
    node: keyword('clear', 'Reset functions', {
      children: [
        keyword('access-list', 'Clear access list statistical information', {
          when: CliWhens.routing,
          children: [keyword('counters', 'Clear access list counters', { run: clearCounters, children: [param('acl', { type: 'word', label: 'WORD' }, 'Access list name or number', { run: clearCounters })] })],
        }),
      ],
    }),
  },
]
