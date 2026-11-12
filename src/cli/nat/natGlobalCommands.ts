// Global NAT commands (docs/SECURITY_PACK.md §8, IOS address-conservation guide):
//   ip nat pool <name> <start> <end> {netmask <mask> | prefix-length <n>}
//   ip nat inside source list <acl> {pool <name> | interface <if>} [overload]
//   ip nat inside source static [tcp|udp] <local> [<port>] <global> [<port>]
// Error texts marked UNVERIFIED in natMessages.ts.
import type { NatDynamicRule, NatDynamicTarget, NatPool, NatStaticRule } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { type CliNodeOptions, CliWhens, keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { NatEdits } from './NatEdits'
import { NAT_ERRORS } from './natMessages'

const POOL_NAME = /^\S{1,64}$/

function sameStatic(a: NatStaticRule, b: NatStaticRule): boolean {
  return a.insideLocal === b.insideLocal && a.insideGlobal === b.insideGlobal && a.protocol === b.protocol && a.insideLocalPort === b.insideLocalPort && a.insideGlobalPort === b.insideGlobalPort
}

/** Same local (or global) side: IOS refuses a second mapping for it. */
function clashes(a: NatStaticRule, b: NatStaticRule): boolean {
  if (a.protocol !== b.protocol) return false
  return (a.insideLocal === b.insideLocal && a.insideLocalPort === b.insideLocalPort) || (a.insideGlobal === b.insideGlobal && a.insideGlobalPort === b.insideGlobalPort)
}

function poolOf(ctx: CliContext): NatPool | string {
  const name = ctx.args.text('pool')
  if (!POOL_NAME.test(name)) return NAT_ERRORS.badPoolName
  const start = ctx.args.text('start')
  const end = ctx.args.text('end')
  const netmask = ctx.args.has('mask') ? ctx.args.text('mask') : Ipv4.format(Ipv4.prefixToMask(ctx.args.number('length')))
  if (!Ipv4.isValidMask(netmask)) return NAT_ERRORS.badMask
  if ((Ipv4.parse(end) ?? 0) < (Ipv4.parse(start) ?? 0)) return NAT_ERRORS.endBeforeStart
  if (!Ipv4.sameSubnet(start, end, netmask)) return NAT_ERRORS.differentSubnets
  return { name, start, end, netmask }
}

function addPool(ctx: CliContext): CliCommandResult {
  const pool = poolOf(ctx)
  if (typeof pool === 'string') return { lines: cliError(pool) }
  const device = NatEdits.update(ctx.device, (nat) => {
    const exists = nat.pools.some((candidate) => candidate.name === pool.name)
    return { ...nat, pools: exists ? nat.pools.map((candidate) => (candidate.name === pool.name ? pool : candidate)) : [...nat.pools, pool] }
  })
  return { device }
}

function removePool(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('pool')
  const nat = NatEdits.natOf(ctx.device)
  if (!nat.pools.some((pool) => pool.name === name)) return { lines: cliError(NAT_ERRORS.poolNotFound(name)) }
  if (nat.dynamics.some((rule) => rule.target.kind === 'pool' && rule.target.poolName === name)) return { lines: cliError(NAT_ERRORS.poolInUse(name)) }
  return { device: NatEdits.update(ctx.device, (value) => ({ ...value, pools: value.pools.filter((pool) => pool.name !== name) })) }
}

function dynamicTarget(ctx: CliContext): NatDynamicTarget | string {
  if (ctx.args.has('poolName')) return { kind: 'pool', poolName: ctx.args.text('poolName') }
  const iface = DeviceInterfaces.resolve(ctx.device, ctx.args.interface('global'))
  if (iface === undefined || (iface.kind === 'port' && iface.port.role === 'switched')) return NAT_ERRORS.badInterface
  return { kind: 'interface', interfaceId: iface.id }
}

function addDynamic(ctx: CliContext, overload: boolean): CliCommandResult {
  const target = dynamicTarget(ctx)
  if (typeof target === 'string') return { lines: cliError(target) }
  const rule: NatDynamicRule = { kind: 'dynamic', aclName: ctx.args.text('acl'), target, overload }
  const device = NatEdits.update(ctx.device, (nat) => {
    const exists = nat.dynamics.some((candidate) => candidate.aclName === rule.aclName)
    return { ...nat, dynamics: exists ? nat.dynamics.map((candidate) => (candidate.aclName === rule.aclName ? rule : candidate)) : [...nat.dynamics, rule] }
  })
  return { device }
}

function removeDynamic(ctx: CliContext): CliCommandResult {
  const aclName = ctx.args.text('acl')
  if (!NatEdits.natOf(ctx.device).dynamics.some((rule) => rule.aclName === aclName)) return { lines: cliError(NAT_ERRORS.mappingNotFound) }
  return { device: NatEdits.update(ctx.device, (nat) => ({ ...nat, dynamics: nat.dynamics.filter((rule) => rule.aclName !== aclName) })) }
}

function staticOf(ctx: CliContext): NatStaticRule {
  const base: NatStaticRule = { kind: 'static', insideLocal: ctx.args.text('local'), insideGlobal: ctx.args.text('globalIp') }
  const protocol = ctx.path.includes('tcp') ? 'tcp' : ctx.path.includes('udp') ? 'udp' : undefined
  if (protocol === undefined) return base
  return { ...base, protocol, insideLocalPort: ctx.args.number('localPort'), insideGlobalPort: ctx.args.number('globalPort') }
}

function addStatic(ctx: CliContext): CliCommandResult {
  const rule = staticOf(ctx)
  const statics = NatEdits.natOf(ctx.device).statics
  if (statics.some((candidate) => sameStatic(candidate, rule))) return {}
  const clash = statics.find((candidate) => clashes(candidate, rule))
  if (clash !== undefined) return { lines: cliError(NAT_ERRORS.similarStatic(clash.insideLocal, clash.insideGlobal)) }
  return { device: NatEdits.update(ctx.device, (nat) => ({ ...nat, statics: [...nat.statics, rule] })) }
}

function removeStatic(ctx: CliContext): CliCommandResult {
  const rule = staticOf(ctx)
  if (!NatEdits.natOf(ctx.device).statics.some((candidate) => sameStatic(candidate, rule))) return { lines: cliError(NAT_ERRORS.translationNotFound) }
  return { device: NatEdits.update(ctx.device, (nat) => ({ ...nat, statics: nat.statics.filter((candidate) => !sameStatic(candidate, rule)) })) }
}

const overloadNode = keyword('overload', 'Overload an address translation', { run: (ctx) => addDynamic(ctx, true), runNo: removeDynamic })
const dynamicLeaf: CliNodeOptions = { run: (ctx) => addDynamic(ctx, false), runNo: removeDynamic, children: [overloadNode] }

const listNode = keyword('list', 'Specify access list describing local addresses', {
  children: [
    param('acl', { type: 'word', label: 'WORD' }, 'Access list number or name for local addresses', {
      children: [
        keyword('pool', 'Name pool of global addresses', { children: [param('poolName', { type: 'word' }, 'Pool name for global addresses', dynamicLeaf)] }),
        keyword('interface', 'Specify interface for global address', { children: [param('global', { type: 'interface' }, 'Interface for global address', dynamicLeaf)] }),
      ],
    }),
  ],
})

function portedStatic(word: 'tcp' | 'udp', help: string) {
  const leaf: CliNodeOptions = { run: addStatic, runNo: removeStatic }
  return keyword(word, help, {
    children: [
      param('local', { type: 'ipv4' }, 'Inside local IP address', {
        children: [
          param('localPort', { type: 'number', min: 1, max: 65535 }, 'Local UDP/TCP port', {
            children: [
              param('globalIp', { type: 'ipv4' }, 'Inside global IP address', {
                children: [param('globalPort', { type: 'number', min: 1, max: 65535 }, 'Global UDP/TCP port', leaf)],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

const staticNode = keyword('static', 'Specify static local->global mapping', {
  children: [
    portedStatic('tcp', 'Transmission Control Protocol'),
    portedStatic('udp', 'User Datagram Protocol'),
    param('local', { type: 'ipv4' }, 'Inside local IP address', {
      children: [param('globalIp', { type: 'ipv4' }, 'Inside global IP address', { run: addStatic, runNo: removeStatic })],
    }),
  ],
})

const poolNode = keyword('pool', 'Define pool of addresses', {
  children: [
    param('pool', { type: 'word' }, 'Pool name', {
      runNo: removePool,
      children: [
        param('start', { type: 'ipv4' }, 'Start IP address', {
          runNo: removePool,
          children: [
            param('end', { type: 'ipv4' }, 'End IP address', {
              runNo: removePool,
              children: [
                keyword('netmask', 'Specify the network mask', { children: [param('mask', { type: 'ipv4' }, 'Network mask', { run: addPool, runNo: removePool })] }),
                keyword('prefix-length', 'Specify the prefix length', {
                  children: [param('length', { type: 'number', min: 1, max: 32 }, 'Prefix length', { run: addPool, runNo: removePool })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
})

export const natGlobalCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        keyword('nat', 'NAT configuration commands', {
          when: CliWhens.routerPlatform,
          children: [poolNode, keyword('inside', 'Inside address translation', { children: [keyword('source', 'Source address translation', { children: [listNode, staticNode] })] })],
        }),
      ],
    }),
  },
]
