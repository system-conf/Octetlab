// The vty side of remote access (pack 5.2, docs/SECURITY_PACK.md §9): which protocols a device accepts,
// its vty `access-class`, and how a login ends. Pure: the server (RemoteServer), the client (RemoteClient)
// and the CLI's `telnet` prompts read the same rules.
//
// IOS rules used (https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html,
// https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-software-releases-121-mainline/46960-config-telnet.html):
// - SSH needs RSA keys; `transport input` limits the protocols (absent = all, [] = none);
// - vty `login` without a `password` refuses the session with "Password required, but none set";
// - `login local` checks the `username` database (secret first, else password).
// Lab rules (UNVERIFIED on IOS): SSH logs in only with `login local` (a line password or `no login` fails);
// telnet with `no login` gets in without credentials; an SSH v2-only server needs keys of 768 bits or more.
import type { Device, LineSettings, LocalUser, NetworkState, VtyTransport } from '../../../domain'
import { AclMatcher } from '../../../net/AclMatcher'
import { DeviceAddresses } from '../../../net/DeviceAddresses'
import { CliPrompt, managementOf } from '../../../cli/core/CliPrompt'
import type { RemoteConnectOutcome } from '../../contract'

/** How the vty lines authenticate a session. */
export type VtyLoginMode = 'none' | 'line' | 'local' | 'passwordNotSet'

/** The credentials a client offers (absent = none typed). */
export interface RemoteCredentials {
  readonly username?: string
  readonly password?: string
}

/** Smallest modulus SSH version 2 accepts (IOS). */
export const SSH_V2_MIN_BITS = 768
const DEFAULT_PRIVILEGE = 1
const ALL_TRANSPORTS: readonly VtyTransport[] = ['ssh', 'telnet']

export class VtyAccess {
  /** Devices with IOS vty lines: routers, wireless routers and managed switches. */
  static hasVty(device: Device): boolean {
    return device.kind === 'router' || device.kind === 'wirelessRouter' || device.kind === 'switch' || device.kind === 'l3Switch'
  }

  static vty(device: Device): LineSettings {
    return managementOf(device).lines?.vty ?? {}
  }

  /** `transport input` of the vty lines (absent = all). */
  static transports(device: Device): readonly VtyTransport[] {
    return VtyAccess.vty(device).transportInput ?? ALL_TRANSPORTS
  }

  /** SSH server state: keys present, and big enough when only version 2 is allowed. */
  static sshEnabled(device: Device): boolean {
    const ssh = managementOf(device).ssh
    const bits = ssh?.rsaKeyBits
    if (bits === undefined) return false
    return ssh?.version !== 2 || bits >= SSH_V2_MIN_BITS
  }

  /** Does the device accept connections of `protocol` at all (else TCP RST: connection refused)? */
  static accepts(device: Device, protocol: VtyTransport): boolean {
    if (!VtyAccess.hasVty(device) || !VtyAccess.transports(device).includes(protocol)) return false
    return protocol === 'telnet' || VtyAccess.sshEnabled(device)
  }

  /** The vty `access-class … in` lets the source in (no binding, or a missing list = permit). */
  static accessClassPermits(device: Device, srcIp: string, dstIp: string, dstPort: number): boolean {
    const name = VtyAccess.vty(device).accessClass?.in
    if (name === undefined) return true
    const list = device.features?.accessLists?.lists.find((candidate) => candidate.name === name)
    return AclMatcher.permits(AclMatcher.decide(list, { protocol: 'tcp', src: srcIp, dst: dstIp, dstPort, tcpFlags: ['syn'] }))
  }

  static loginMode(device: Device): VtyLoginMode {
    const vty = VtyAccess.vty(device)
    if (vty.loginLocal === true) return 'local'
    if (!(vty.login ?? true)) return 'none'
    return vty.password === undefined ? 'passwordNotSet' : 'line'
  }

  /** How a login with `credentials` ends on `device` (scope A: the session stops after it). */
  static authenticate(device: Device, protocol: VtyTransport, credentials: RemoteCredentials): RemoteConnectOutcome {
    const mode = VtyAccess.loginMode(device)
    if (mode === 'passwordNotSet') return { ok: false, failure: 'passwordNotSet', reason: 'remoteLoginFailed' }
    if (mode === 'local') {
      const user = VtyAccess.user(device, credentials.username)
      if (user === undefined || (user.secret ?? user.password) !== credentials.password) return VtyAccess.authFailed()
      return VtyAccess.opened(device, user.privilege ?? DEFAULT_PRIVILEGE)
    }
    if (protocol === 'ssh') return VtyAccess.authFailed()
    if (mode === 'line' && credentials.password !== VtyAccess.vty(device).password) return VtyAccess.authFailed()
    return VtyAccess.opened(device, DEFAULT_PRIVILEGE)
  }

  /** The device that owns `ip` and has vty lines (the client's view of its target), if any. */
  static deviceAt(network: NetworkState, ip: string): Device | undefined {
    return network.devices.find((device) => device.powered && VtyAccess.hasVty(device) && DeviceAddresses.has(device, ip))
  }

  private static user(device: Device, name: string | undefined): LocalUser | undefined {
    if (name === undefined) return undefined
    return managementOf(device).users?.find((user) => user.name === name)
  }

  private static opened(device: Device, privilege: number): RemoteConnectOutcome {
    const banner = managementOf(device).bannerMotd
    return { ok: true, hostname: CliPrompt.hostname(device), privilege, ...(banner === undefined ? {} : { bannerMotd: banner }) }
  }

  private static authFailed(): RemoteConnectOutcome {
    return { ok: false, failure: 'authFailed', reason: 'remoteLoginFailed' }
  }
}
