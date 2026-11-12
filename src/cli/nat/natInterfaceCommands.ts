// Interface NAT roles (docs/SECURITY_PACK.md §8): `ip nat inside` / `ip nat outside` and their `no`
// forms on routed ports and sub-interfaces of a router. Stored as L3Features.natRole.
import type { NatRole } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { CliWhens, keyword } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceEdits } from '../core/DeviceEdits'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { NatEdits } from './NatEdits'
import { NAT_ERRORS } from './natMessages'

function currentId(ctx: CliContext): string | null {
  return ctx.mode.kind === 'interface' || ctx.mode.kind === 'subInterface' ? ctx.mode.interfaceId : null
}

/** Sets the role; `no ip nat <role>` clears it only when the interface has that role. */
function setRole(ctx: CliContext, role: NatRole, on: boolean): CliCommandResult {
  const id = currentId(ctx)
  const iface = id === null ? undefined : DeviceInterfaces.find(ctx.device, id)
  if (iface === undefined || (iface.kind === 'port' && iface.port.role === 'switched')) {
    return on ? { lines: cliError(NAT_ERRORS.badInterface) } : {}
  }
  return {
    device: DeviceEdits.updateL3(ctx.device, iface.id, (l3) => {
      if (on) return NatEdits.withRole(l3, role)
      return l3.features?.natRole === role ? NatEdits.withRole(l3, undefined) : l3
    }),
  }
}

export const natInterfaceCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface', 'subInterface'],
    node: keyword('ip', 'Interface Internet Protocol config commands', {
      children: [
        keyword('nat', 'NAT interface commands', {
          when: CliWhens.routerPlatform,
          children: [
            keyword('inside', 'Inside interface for address translation', { run: (ctx) => setRole(ctx, 'inside', true), runNo: (ctx) => setRole(ctx, 'inside', false) }),
            keyword('outside', 'Outside interface for address translation', { run: (ctx) => setRole(ctx, 'outside', true), runNo: (ctx) => setRole(ctx, 'outside', false) }),
          ],
        }),
      ],
    }),
  },
]
