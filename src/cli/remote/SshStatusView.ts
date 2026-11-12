// `show ip ssh` and `show ssh` (pack 5.2). Format of IOS 15.1 (the version running-config prints):
// https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html shows
// "SSH Enabled - version 2.0" and "Authentication timeout: 120 secs; Authentication retries: 3"; the
// disabled form and the "%No SSHvN server connections running." lines are quoted from Cisco Community
// output (UNVERIFIED against an official page). Scope A has no open sessions, so `show ssh` lists none.
import type { Device } from '../../domain'
import { VtyAccess } from '../../sim/services/remote/VtyAccess'
import { managementOf } from '../core/CliPrompt'
import { CREATE_KEYS_HINT, SSH_DEFAULTS } from './remoteConfigCommands'

export class SshStatusView {
  static enabled(device: Device): boolean {
    return VtyAccess.sshEnabled(device)
  }

  /** '2.0' (version 2 only), '1.5' (version 1 only), '1.99' (both, the default). */
  static versionText(device: Device): string {
    switch (managementOf(device).ssh?.version) {
      case 2:
        return '2.0'
      case 1:
        return '1.5'
      default:
        return '1.99'
    }
  }

  static showIpSsh(device: Device): string[] {
    const ssh = managementOf(device).ssh
    const timeout = ssh?.timeoutSeconds ?? SSH_DEFAULTS.timeoutSeconds
    const retries = ssh?.authRetries ?? SSH_DEFAULTS.authRetries
    const enabled = SshStatusView.enabled(device)
    return [
      `SSH ${enabled ? 'Enabled' : 'Disabled'} - version ${SshStatusView.versionText(device)}`,
      ...(enabled ? [] : [CREATE_KEYS_HINT]),
      `Authentication timeout: ${timeout} secs; Authentication retries: ${retries}`,
    ]
  }

  static showSsh(device: Device): string[] {
    const version = managementOf(device).ssh?.version
    return [
      ...(version === 2 ? [] : ['%No SSHv1 server connections running.']),
      ...(version === 1 ? [] : ['%No SSHv2 server connections running.']),
    ]
  }
}
