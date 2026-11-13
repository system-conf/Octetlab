// Interface commands of the firewall (docs/FIREWALL_PACK.md §6.2): `nameif <name>` / `no nameif` and
// `security-level <0-100>` / `no security-level`, stored in L3Features.firewall. `ip address` and
// `shutdown` are the router / core commands (not duplicated here).
// The INFO text is the appliance's own wording for a nameif without a level ("set to 100 / 0 by default",
// https://networklessons.com/cisco/asa-firewall/cisco-asa-security-levels, verified in §3); the CLI stores
// that default level explicitly, so running-config always shows `security-level` after `nameif`.
import { SECURITY_LEVEL_MAX, SECURITY_LEVEL_MIN, type FirewallInterfaceSettings } from '../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliError, cliText } from '../core/CliOutput'
import { DeviceEdits } from '../core/DeviceEdits'
import { RouterEdits } from '../router/RouterEdits'
import { FirewallEdits } from './FirewallEdits'
import { FirewallInterfaces, INSIDE_NAME } from './FirewallInterfaces'
import { FIREWALL_ERRORS, isFirewall } from './firewallMessages'

/** Lab rule: a letter, then letters, digits, '_', '.', '-'; 48 characters at most. */
const NAMEIF_PATTERN = /^[A-Za-z][\w.-]{0,47}$/

function currentInterface(ctx: CliContext): ReturnType<typeof RouterEdits.current> {
  const iface = RouterEdits.current(ctx)
  if (iface === undefined || (iface.kind === 'port' && iface.port.role !== 'routed')) return undefined
  return iface
}

function setNameif(ctx: CliContext): CliCommandResult {
  const iface = currentInterface(ctx)
  if (iface === undefined) return { lines: cliError(FIREWALL_ERRORS.notRouted) }
  const name = ctx.args.text('nameif')
  if (!NAMEIF_PATTERN.test(name)) return { lines: cliError(FIREWALL_ERRORS.badNameif(name)) }
  const other = FirewallInterfaces.byName(ctx.device, name)
  if (other !== undefined && other.iface.id !== iface.id) return { lines: cliError(FIREWALL_ERRORS.nameifUsed(name)) }
  const current = FirewallInterfaces.settingsOf(iface)
  const level = current?.securityLevel ?? (name === INSIDE_NAME ? SECURITY_LEVEL_MAX : SECURITY_LEVEL_MIN)
  const settings: FirewallInterfaceSettings = { nameif: name, securityLevel: level }
  const device = DeviceEdits.updateL3(ctx.device, iface.id, (l3) => FirewallEdits.withInterface(l3, settings))
  const info = current?.securityLevel === undefined ? cliText(`INFO: Security level for "${name}" set to ${level} by default.`) : []
  return { device, lines: info }
}

function clearNameif(ctx: CliContext): CliCommandResult {
  const iface = currentInterface(ctx)
  if (iface === undefined) return {}
  return { device: DeviceEdits.updateL3(ctx.device, iface.id, (l3) => FirewallEdits.withInterface(l3, undefined)) }
}

function setLevel(ctx: CliContext, level: number): CliCommandResult {
  const iface = currentInterface(ctx)
  if (iface === undefined) return { lines: cliError(FIREWALL_ERRORS.notRouted) }
  const current = FirewallInterfaces.settingsOf(iface)
  if (current === undefined) return { lines: cliError(FIREWALL_ERRORS.levelNeedsNameif) }
  return { device: DeviceEdits.updateL3(ctx.device, iface.id, (l3) => FirewallEdits.withInterface(l3, { ...current, securityLevel: level })) }
}

export const firewallInterfaceCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['interface', 'subInterface'],
    node: keyword('nameif', 'Assign name to interface', {
      when: isFirewall,
      runNo: clearNameif,
      children: [param('nameif', { type: 'word', label: 'WORD' }, 'Name of interface', { run: setNameif, runNo: clearNameif })],
    }),
  },
  {
    modes: ['interface', 'subInterface'],
    node: keyword('security-level', 'Specify security level of this interface', {
      when: isFirewall,
      // Lab rule: `no security-level` sets level 0 (real appliance behaviour UNVERIFIED).
      runNo: (ctx) => setLevel(ctx, SECURITY_LEVEL_MIN),
      children: [
        param('level', { type: 'number', min: SECURITY_LEVEL_MIN, max: SECURITY_LEVEL_MAX }, 'Security level', {
          run: (ctx) => setLevel(ctx, ctx.args.number('level')),
          runNo: (ctx) => setLevel(ctx, SECURITY_LEVEL_MIN),
        }),
      ],
    }),
  },
]
