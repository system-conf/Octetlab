// Show commands of remote access (pack 5.2): `show ip ssh`, `show ssh`, `show users`,
// `show crypto key mypubkey rsa`. The views are in SshStatusView / RemoteShowViews.
import type { CliCommandRegistration } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'
import { keyword } from '../core/CliNodes'
import { cliText } from '../core/CliOutput'
import { RemoteShowViews } from './RemoteShowViews'
import { SshStatusView } from './SshStatusView'

export const remoteShowCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [
        keyword('ip', 'IP information', {
          children: [keyword('ssh', 'Information on SSH', { run: (ctx) => ({ lines: cliText(...SshStatusView.showIpSsh(ctx.device)) }) })],
        }),
        keyword('ssh', 'Status of SSH server connections', { run: (ctx) => ({ lines: cliText(...SshStatusView.showSsh(ctx.device)) }) }),
        keyword('users', 'Display information about terminal lines', { run: () => ({ lines: cliText(...RemoteShowViews.users()) }) }),
        keyword('crypto', 'Encryption module', {
          children: [
            keyword('key', 'Show long term public keys', {
              children: [
                keyword('mypubkey', 'Show public keys associated with this router', {
                  children: [keyword('rsa', 'Show RSA public keys', { run: (ctx) => ({ lines: cliText(...RemoteShowViews.mypubkey(ctx.device)) }) })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
]
