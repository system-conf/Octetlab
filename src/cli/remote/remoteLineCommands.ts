// Line sub-commands of remote access (pack 5.2): vty `transport input …` and `login local`. `login` /
// `no login` (core lineCommands) drop `login local`, and `login local` drops `login`: one login method.
import type { VtyTransport } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { keyword } from '../core/CliNodes'
import { cliMessage } from '../core/CliOutput'
import { RemoteEdits } from './RemoteEdits'

/** `transport input` applies to vty lines only in the lab (the console takes no network sessions). */
function setTransport(ctx: CliContext, transports: readonly VtyTransport[] | undefined): CliCommandResult {
  if (ctx.mode.kind !== 'line' || ctx.mode.lineType !== 'vty') return { lines: [cliMessage(localizedMessage('remoteAccess:cli.vtyOnly'))] }
  return RemoteEdits.updateLine(ctx, (settings) => RemoteEdits.setLine(settings, 'transportInput', transports === undefined ? undefined : [...transports]))
}

function loginLocal(ctx: CliContext, on: boolean): CliCommandResult {
  return RemoteEdits.updateLine(ctx, (settings) => {
    const withoutLogin = RemoteEdits.setLine(settings, 'login', undefined)
    return RemoteEdits.setLine(on ? withoutLogin : settings, 'loginLocal', on ? true : undefined)
  })
}

const transportChoice = (word: string, help: string, transports: readonly VtyTransport[] | undefined, more: readonly VtyTransport[] = []) =>
  keyword(word, help, {
    run: (ctx) => setTransport(ctx, transports),
    children: more.map((extra) => keyword(extra, extra === 'ssh' ? 'TCP/IP SSH protocol' : 'TCP/IP Telnet protocol', { run: (ctx) => setTransport(ctx, ['ssh', 'telnet']) })),
  })

export const remoteLineCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['line'],
    node: keyword('transport', 'Define transport protocols for line', {
      children: [
        keyword('input', 'Define which protocols to use when connecting to the terminal server', {
          runNo: (ctx) => setTransport(ctx, undefined),
          children: [
            transportChoice('all', 'All protocols', undefined),
            transportChoice('none', 'No protocols', []),
            transportChoice('ssh', 'TCP/IP SSH protocol', ['ssh'], ['telnet']),
            transportChoice('telnet', 'TCP/IP Telnet protocol', ['telnet'], ['ssh']),
          ],
        }),
      ],
    }),
  },
  {
    modes: ['line'],
    node: keyword('login', 'Enable password checking', {
      children: [keyword('local', 'Local password checking', { run: (ctx) => loginLocal(ctx, true), runNo: (ctx) => loginLocal(ctx, false) })],
    }),
  },
]
