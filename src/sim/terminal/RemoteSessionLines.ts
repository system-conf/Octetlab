// Client output of `telnet` / `ssh` (pack 5.2, scope A: docs/SECURITY_PACK.md §2), shared by the router
// CLI (src/cli/remote) and the host terminal (SimTerminal), which print IOS / Packet Tracer style text.
// Sources: "Trying … Open", "Password required, but none set", "[Connection to … closed by foreign host]",
// "User Access Verification":
// https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-software-releases-121-mainline/46960-config-telnet.html
// UNVERIFIED (Cisco Community quotes, no official page): "% Connection refused by remote host",
// "% Connection timed out; remote host not responding", "% Destination unreachable; gateway or host down",
// "% Login invalid", "% Bad passwords", "% Authentication failed".
import type { TerminalLine } from '../../domain'
import { messageLine, textLines } from '../../engine/terminalLines'
import { localizedMessage } from '../../i18n/messageKeys'
import type { RemoteConnectOutcome } from '../contract'
import type { VtyLoginMode } from '../services/remote/VtyAccess'

type Protocol = 'ssh' | 'telnet'
type Failure = Extract<RemoteConnectOutcome, { ok: false }>

export const USER_ACCESS_VERIFICATION = 'User Access Verification'

export class RemoteSessionLines {
  /** "Trying 10.0.0.2 ... Open": telnet's connected line (ssh prints none). */
  static openLine(protocol: Protocol, ip: string): TerminalLine[] {
    return protocol === 'telnet' ? textLines([`Trying ${ip} ... Open`, '']) : []
  }

  /** The vty's login banner before the credentials are asked. */
  static loginPrompt(protocol: Protocol): TerminalLine[] {
    return protocol === 'telnet' ? textLines([USER_ACCESS_VERIFICATION, '']) : []
  }

  /** Logged in: the MOTD banner, then a hint that the remote prompt is not simulated (scope A). */
  static opened(outcome: Extract<RemoteConnectOutcome, { ok: true }>): TerminalLine[] {
    const banner = outcome.bannerMotd === undefined ? [] : textLines([...outcome.bannerMotd.split('\n'), ''])
    return [...banner, messageLine(localizedMessage('remoteAccess:session.opened', { hostname: outcome.hostname, privilege: outcome.privilege }), 'info')]
  }

  /** A failure before or at the login; `mode` = the target's login method (for the telnet texts). */
  static failure(protocol: Protocol, ip: string, failure: Failure, mode: VtyLoginMode | null): TerminalLine[] {
    const trying = protocol === 'telnet' ? `Trying ${ip} ... ` : null
    const closed = `[Connection to ${ip} closed by foreign host]`
    switch (failure.failure) {
      case 'refused':
        return RemoteSessionLines.withTrying(trying, '% Connection refused by remote host')
      case 'timedOut':
        return RemoteSessionLines.withTrying(trying, '% Connection timed out; remote host not responding')
      case 'unreachable':
      case 'adminProhibited':
      case 'localFailure':
        return RemoteSessionLines.withTrying(trying, '% Destination unreachable; gateway or host down')
      case 'passwordNotSet':
        return [...textLines([`Trying ${ip} ... Open`, '']), ...textLines(['Password required, but none set', '', closed], 'error')]
      case 'authFailed':
        if (protocol === 'ssh') return textLines(['% Authentication failed'], 'error')
        return textLines([mode === 'line' ? '% Bad passwords' : '% Login invalid', '', closed], 'error')
    }
  }

  private static withTrying(trying: string | null, message: string): TerminalLine[] {
    return [...(trying === null ? [] : textLines([trying])), ...textLines([message], 'error')]
  }
}
