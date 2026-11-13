// Global firewall commands (docs/FIREWALL_PACK.md §6.2):
//   same-security-traffic permit inter-interface|intra-interface   → features.firewall.sameSecurity*
//   timeout conn|half-closed|udp|icmp <h:mm:ss>                      → features.firewall.timeouts (seconds)
//   inspect icmp / no inspect icmp (simplified, no policy-map)       → features.firewall.inspectIcmp
//   access-group <acl> in|out interface <nameif>                     → that port's L3Features.accessGroups
//   route <nameif> <net> <mask> <gateway> [<distance>]               → routing.staticRoutes (exit interface + next hop)
// Every `no` form restores the factory value as an absent key.
import type { AclBinding, FirewallTimeouts, L3Features, L3Settings, StaticRoute } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliNode } from '../contract'
import { withDirection } from '../acl/aclBindingCommands'
import { keyword, param } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceEdits } from '../core/DeviceEdits'
import { RouterEdits } from '../router/RouterEdits'
import { DEFAULT_TIMEOUTS, FirewallClock } from './FirewallClock'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces } from './FirewallInterfaces'
import { FIREWALL_ERRORS, isFirewall } from './firewallMessages'

type Direction = 'in' | 'out'
type TimeoutKey = keyof FirewallTimeouts

const STATIC_DISTANCE = 1
const MAX_DISTANCE = 255

// ---------------------------------------------------------------- same-security-traffic

function setSameSecurity(ctx: CliContext, key: 'sameSecurityInterInterface' | 'sameSecurityIntraInterface', on: boolean): CliCommandResult {
  return {
    device: FirewallEdits.update(ctx.device, (settings) => {
      const copy = { ...settings }
      if (on) copy[key] = true
      else delete copy[key]
      return copy
    }),
  }
}

const sameSecurityNode = keyword('same-security-traffic', 'Configure same security traffic', {
  when: isFirewall,
  children: [
    keyword('permit', 'Permit same security traffic', {
      children: [
        keyword('inter-interface', 'Permit traffic between interfaces with the same security level', {
          run: (ctx) => setSameSecurity(ctx, 'sameSecurityInterInterface', true),
          runNo: (ctx) => setSameSecurity(ctx, 'sameSecurityInterInterface', false),
        }),
        keyword('intra-interface', 'Permit traffic in and out of the same interface', {
          run: (ctx) => setSameSecurity(ctx, 'sameSecurityIntraInterface', true),
          runNo: (ctx) => setSameSecurity(ctx, 'sameSecurityIntraInterface', false),
        }),
      ],
    }),
  ],
})

// ---------------------------------------------------------------- timeout

function setTimeout(ctx: CliContext, key: TimeoutKey, seconds: number | null): CliCommandResult {
  return {
    device: FirewallEdits.update(ctx.device, (settings) => {
      const timeouts: FirewallTimeouts = { ...settings.timeouts }
      if (seconds === null || seconds === DEFAULT_TIMEOUTS[key]) delete timeouts[key]
      else timeouts[key] = seconds
      return { ...settings, timeouts }
    }),
  }
}

function timeoutNode(word: string, key: TimeoutKey, help: string): CliNode {
  const parse = (ctx: CliContext): CliCommandResult => {
    const text = ctx.args.text('clock')
    const seconds = FirewallClock.parse(text)
    return seconds === null ? { lines: cliError(FIREWALL_ERRORS.badTimeout(text)) } : setTimeout(ctx, key, seconds)
  }
  return keyword(word, help, {
    runNo: (ctx) => setTimeout(ctx, key, null),
    children: [param('clock', { type: 'word', label: 'hh:mm:ss' }, `Idle time (default ${FirewallClock.format(DEFAULT_TIMEOUTS[key])})`, { run: parse, runNo: (ctx) => setTimeout(ctx, key, null) })],
  })
}

const timeoutRoot = keyword('timeout', 'Configure the maximum idle time', {
  when: isFirewall,
  children: [
    timeoutNode('conn', 'tcp', 'Idle time after which an established connection closes'),
    timeoutNode('half-closed', 'halfClosed', 'Idle time after which a half-closed connection closes'),
    timeoutNode('icmp', 'icmp', 'Idle time after which an ICMP slot is freed'),
    timeoutNode('udp', 'udp', 'Idle time after which a UDP slot is freed'),
  ],
})

// ---------------------------------------------------------------- inspect icmp

function setInspectIcmp(ctx: CliContext, on: boolean): CliCommandResult {
  return {
    device: FirewallEdits.update(ctx.device, (settings) => {
      const copy = { ...settings }
      // Absent = on (D2), so only the switched-off state is stored.
      if (on) delete copy.inspectIcmp
      else copy.inspectIcmp = false
      return copy
    }),
  }
}

const inspectRoot = keyword('inspect', 'Configure application inspection', {
  when: isFirewall,
  children: [keyword('icmp', 'Track ICMP echo replies', { run: (ctx) => setInspectIcmp(ctx, true), runNo: (ctx) => setInspectIcmp(ctx, false) })],
})

// ---------------------------------------------------------------- access-group <acl> in|out interface <nameif>

function withGroups(l3: L3Settings, groups: AclBinding | undefined): L3Settings {
  const features: L3Features = { ...l3.features }
  if (groups === undefined) delete features.accessGroups
  else features.accessGroups = groups
  const copy = { ...l3 }
  if (Object.keys(features).length === 0) delete copy.features
  else copy.features = features
  return copy
}

function bindGroup(ctx: CliContext, direction: Direction, remove: boolean): CliCommandResult {
  const nameif = ctx.args.text('nameif')
  const target = FirewallInterfaces.byName(ctx.device, nameif)
  if (target === undefined) return remove ? {} : { lines: cliError(FIREWALL_ERRORS.unknownNameif(nameif)) }
  const acl = ctx.args.text('acl')
  const current = target.l3.features?.accessGroups
  // `no access-group X in interface y` leaves a different list alone, like `no ip access-group`.
  if (remove && current?.[direction] !== acl) return {}
  return { device: DeviceEdits.updateL3(ctx.device, target.iface.id, (l3) => withGroups(l3, withDirection(l3.features?.accessGroups, direction, remove ? undefined : acl))) }
}

function directionNode(direction: Direction, help: string): CliNode {
  return keyword(direction, help, {
    children: [
      keyword('interface', 'Bind to an interface', {
        children: [
          param('nameif', { type: 'word', label: 'WORD' }, 'Name of interface (nameif)', {
            run: (ctx) => bindGroup(ctx, direction, false),
            runNo: (ctx) => bindGroup(ctx, direction, true),
          }),
        ],
      }),
    ],
  })
}

const accessGroupRoot = keyword('access-group', 'Bind an access list to an interface', {
  when: isFirewall,
  children: [param('acl', { type: 'word', label: 'WORD' }, 'Access list name', { children: [directionNode('in', 'Filter incoming traffic'), directionNode('out', 'Filter outgoing traffic')] })],
})

// ---------------------------------------------------------------- route <nameif> <net> <mask> <gateway> [<distance>]

function sameRoute(a: StaticRoute, b: StaticRoute): boolean {
  return a.prefix === b.prefix && a.mask === b.mask && a.nextHop === b.nextHop && a.exitInterfaceId === b.exitInterfaceId
}

function isNetwork(prefix: string, mask: string): boolean {
  const value = Ipv4.parse(prefix)
  const maskValue = Ipv4.parse(mask)
  if (value === null || maskValue === null || Ipv4.prefixLength(mask) === null) return false
  return ((value & maskValue) >>> 0) === value
}

function routeOf(ctx: CliContext): StaticRoute | string {
  const nameif = ctx.args.text('nameif')
  const exit = FirewallInterfaces.byName(ctx.device, nameif)
  if (exit === undefined) return FIREWALL_ERRORS.unknownNameif(nameif)
  const prefix = ctx.args.text('prefix')
  const mask = ctx.args.text('mask')
  if (!isNetwork(prefix, mask)) return FIREWALL_ERRORS.inconsistentRoute
  const adminDistance = ctx.args.has('distance') ? ctx.args.number('distance') : STATIC_DISTANCE
  return { prefix, mask, adminDistance, nextHop: ctx.args.text('gateway'), exitInterfaceId: exit.iface.id }
}

function addRoute(ctx: CliContext): CliCommandResult {
  const route = routeOf(ctx)
  if (typeof route === 'string') return { lines: cliError(route) }
  return {
    device: RouterEdits.updateRouting(ctx.device, (routing) => {
      const exists = routing.staticRoutes.some((candidate) => sameRoute(candidate, route))
      return { ...routing, staticRoutes: exists ? routing.staticRoutes.map((candidate) => (sameRoute(candidate, route) ? route : candidate)) : [...routing.staticRoutes, route] }
    }),
  }
}

function removeRoute(ctx: CliContext): CliCommandResult {
  const route = routeOf(ctx)
  if (typeof route === 'string') return { lines: cliError(route) }
  const routes = ctx.device.routing?.staticRoutes ?? []
  if (!routes.some((candidate) => sameRoute(candidate, route))) return { lines: cliError(FIREWALL_ERRORS.noMatchingRoute) }
  return { device: RouterEdits.updateRouting(ctx.device, (routing) => ({ ...routing, staticRoutes: routing.staticRoutes.filter((candidate) => !sameRoute(candidate, route)) })) }
}

const routeRoot = keyword('route', 'Configure a static route for an interface', {
  when: isFirewall,
  children: [
    param('nameif', { type: 'word', label: 'WORD' }, 'Name of the exit interface (nameif)', {
      children: [
        param('prefix', { type: 'ipv4' }, 'Destination network', {
          children: [
            param('mask', { type: 'ipv4' }, 'Destination netmask', {
              children: [
                param('gateway', { type: 'ipv4' }, 'Gateway address', {
                  run: addRoute,
                  runNo: removeRoute,
                  children: [param('distance', { type: 'number', min: 1, max: MAX_DISTANCE }, 'Distance metric for this route', { run: addRoute, runNo: removeRoute })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
})

export const firewallGlobalCommands: readonly CliCommandRegistration[] = [sameSecurityNode, timeoutRoot, inspectRoot, accessGroupRoot, routeRoot].map((node) => ({ modes: ['globalConfig'], node }))
