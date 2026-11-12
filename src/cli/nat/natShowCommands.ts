// NAT show and clear commands (docs/SECURITY_PACK.md §8): `show ip nat translations [verbose]`,
// `show ip nat statistics` (views over env.runtime) and `clear ip nat translation *` (a simulator job:
// only the simulator writes the runtime).
import type { CliCommandRegistration, CliCommandResult, CliContext } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { CliWhens, keyword } from '../core/CliNodes'
import { cliText } from '../core/CliOutput'
import { NatStatisticsView } from './NatStatisticsView'
import { NatTranslationsView } from './NatTranslationsView'

function showTranslations(ctx: CliContext, verbose: boolean): CliCommandResult {
  return { lines: cliText(...NatTranslationsView.lines(ctx.device, ctx.env.runtime, ctx.env.now, verbose)) }
}

function showStatistics(ctx: CliContext): CliCommandResult {
  return { lines: cliText(...NatStatisticsView.lines(ctx.device, ctx.env.runtime, ctx.env.now)) }
}

function clearTranslations(ctx: CliContext): CliCommandResult {
  return { job: { request: { kind: 'clearTable', deviceId: ctx.device.id, table: 'natTranslations' }, onDone: () => ({}) } }
}

export const natShowCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [
        keyword('ip', 'IP information', {
          children: [
            keyword('nat', 'IP NAT information', {
              when: CliWhens.routerPlatform,
              children: [
                keyword('translations', 'Translation entries', {
                  run: (ctx) => showTranslations(ctx, false),
                  children: [keyword('verbose', 'Show extra information', { run: (ctx) => showTranslations(ctx, true) })],
                }),
                keyword('statistics', 'Translation statistics', { run: showStatistics }),
              ],
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
        keyword('ip', 'IP', {
          children: [
            keyword('nat', 'Clear NAT', {
              when: CliWhens.routerPlatform,
              children: [
                keyword('translation', 'Clear dynamic translation', {
                  children: [keyword('*', 'Delete all dynamic translations', { run: clearTranslations })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
]
