// `line con 0` / `line vty 0 4` and the line sub-commands: password, login, exec-timeout, logging synchronous.
import type { LineGroups, LineSettings, ManagementSettings } from '../../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../../contract'
import { keyword, param } from '../CliNodes'
import { cliError } from '../CliOutput'
import { DeviceEdits } from '../DeviceEdits'
import { PasswordEncoding } from '../PasswordEncoding'

const MAX_VTY = 15
const MAX_TIMEOUT_MINUTES = 35791
const MAX_TIMEOUT_SECONDS = 2147483

/** Applies `change` to the settings of the line group the mode is in. */
function updateLine(ctx: CliContext, change: (settings: LineSettings) => LineSettings): CliCommandResult {
  const mode = ctx.mode
  if (mode.kind !== 'line') throw new Error('Line command outside line mode')
  const group = mode.lineType === 'console' ? 'console' : 'vty'
  const device = DeviceEdits.updateManagement(ctx.device, (management): ManagementSettings => {
    // Factory values are stored as absent keys: empty groups and an empty `lines` are dropped.
    const lines: LineGroups = { ...management.lines, [group]: change(management.lines?.[group] ?? {}) }
    if (Object.keys(lines[group] ?? {}).length === 0) delete lines[group]
    const copy: ManagementSettings = { ...management, lines }
    if (Object.keys(lines).length === 0) delete copy.lines
    return copy
  })
  return { device }
}

function without<Key extends keyof LineSettings>(settings: LineSettings, key: Key): LineSettings {
  const copy = { ...settings }
  delete copy[key]
  return copy
}

/**
 * The line type's default (console: no login, vty: login) is stored as "not set". `login` and `no login`
 * replace `login local` (pack 5.2), as on IOS where the line has one login method.
 */
function setLogin(ctx: CliContext, login: boolean): CliCommandResult {
  const byDefault = ctx.mode.kind === 'line' && ctx.mode.lineType === 'vty'
  return updateLine(ctx, (current) => {
    const settings = without(current, 'loginLocal')
    return login === byDefault ? without(settings, 'login') : { ...settings, login }
  })
}

function vtyRange(ctx: CliContext): CliCommandResult {
  const first = ctx.args.number('first')
  const last = ctx.args.has('last') ? ctx.args.number('last') : first
  if (last < first) return { lines: cliError('%Invalid line range') }
  return { mode: { kind: 'line', lineType: 'vty', first, last } }
}

function passwordFromType7(ctx: CliContext): CliCommandResult {
  const password = PasswordEncoding.decodeType7(ctx.args.text('encrypted'))
  if (password === null) return { lines: cliError('Invalid encrypted password') }
  return updateLine(ctx, (settings) => ({ ...settings, password }))
}

export const lineCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('line', 'Configure a terminal line', {
      children: [
        keyword('console', 'Primary terminal line', {
          children: [
            param('first', { type: 'number', min: 0, max: 0 }, 'First Line number', {
              run: () => ({ mode: { kind: 'line', lineType: 'console', first: 0, last: 0 } }),
            }),
          ],
        }),
        keyword('vty', 'Virtual terminal', {
          children: [
            param('first', { type: 'number', min: 0, max: MAX_VTY }, 'First Line number', {
              run: vtyRange,
              children: [param('last', { type: 'number', min: 1, max: MAX_VTY }, 'Last Line number', { run: vtyRange })],
            }),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['line'],
    node: keyword('password', 'Set a password', {
      runNo: (ctx) => updateLine(ctx, (settings) => without(settings, 'password')),
      children: [
        keyword('7', 'Specifies a HIDDEN password will follow', {
          children: [param('encrypted', { type: 'word' }, 'The HIDDEN line password string', { run: passwordFromType7 })],
        }),
        param('password', { type: 'line' }, 'The UNENCRYPTED (cleartext) line password', {
          run: (ctx) => updateLine(ctx, (settings) => ({ ...settings, password: ctx.args.text('password') })),
        }),
      ],
    }),
  },
  {
    modes: ['line'],
    node: keyword('login', 'Enable password checking', {
      run: (ctx) => setLogin(ctx, true),
      runNo: (ctx) => setLogin(ctx, false),
    }),
  },
  {
    modes: ['line'],
    node: keyword('exec-timeout', 'Set the EXEC timeout', {
      runNo: (ctx) => updateLine(ctx, (settings) => without(settings, 'execTimeout')),
      children: [
        param('minutes', { type: 'number', min: 0, max: MAX_TIMEOUT_MINUTES }, 'Timeout in minutes', {
          run: (ctx) => updateLine(ctx, (settings) => ({ ...settings, execTimeout: { minutes: ctx.args.number('minutes'), seconds: 0 } })),
          children: [
            param('seconds', { type: 'number', min: 0, max: MAX_TIMEOUT_SECONDS }, 'Timeout in seconds', {
              run: (ctx) =>
                updateLine(ctx, (settings) => ({
                  ...settings,
                  execTimeout: { minutes: ctx.args.number('minutes'), seconds: ctx.args.number('seconds') },
                })),
            }),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['line'],
    node: keyword('logging', 'Modify message logging facilities', {
      children: [
        keyword('synchronous', 'Synchronized message output', {
          run: (ctx) => updateLine(ctx, (settings) => ({ ...settings, loggingSynchronous: true })),
          runNo: (ctx) => updateLine(ctx, (settings) => without(settings, 'loggingSynchronous')),
        }),
      ],
    }),
  },
]
