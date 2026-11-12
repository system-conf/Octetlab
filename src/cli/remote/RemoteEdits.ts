// Pure edits of the remote-access settings (pack 5.2): domain name, local users, SSH server, vty lines.
// Factory values are stored as absent keys, so a replayed running-config equals the original.
import type { Device, LineSettings, LocalUser, ManagementSettings, SshSettings } from '../../domain'
import type { CliCommandResult, CliContext } from '../contract'
import { managementOf } from '../core/CliPrompt'
import { DeviceEdits } from '../core/DeviceEdits'

function withoutEmpty<Value extends object>(value: Value): Value | undefined {
  return Object.keys(value).length === 0 ? undefined : value
}

function assign<Value extends object, Key extends keyof Value>(target: Value, key: Key, value: Value[Key] | undefined): Value {
  const copy = { ...target }
  if (value === undefined) delete copy[key]
  else copy[key] = value
  return copy
}

export class RemoteEdits {
  static setManagement<Key extends keyof ManagementSettings>(device: Device, key: Key, value: ManagementSettings[Key] | undefined): Device {
    return DeviceEdits.updateManagement(device, (management) => assign(management, key, value))
  }

  static ssh(device: Device): SshSettings {
    return managementOf(device).ssh ?? {}
  }

  static updateSsh(device: Device, change: (ssh: SshSettings) => SshSettings): Device {
    return RemoteEdits.setManagement(device, 'ssh', withoutEmpty(change(RemoteEdits.ssh(device))))
  }

  static setSsh<Key extends keyof SshSettings>(device: Device, key: Key, value: SshSettings[Key] | undefined): Device {
    return RemoteEdits.updateSsh(device, (ssh) => assign(ssh, key, value))
  }

  static users(device: Device): readonly LocalUser[] {
    return managementOf(device).users ?? []
  }

  /** Adds the user, or replaces the one with the same name in place (IOS keeps one entry per name). */
  static putUser(device: Device, user: LocalUser): Device {
    const users = RemoteEdits.users(device)
    const exists = users.some((candidate) => candidate.name === user.name)
    const next = exists ? users.map((candidate) => (candidate.name === user.name ? user : candidate)) : [...users, user]
    return RemoteEdits.setManagement(device, 'users', next)
  }

  static removeUser(device: Device, name: string): Device {
    const next = RemoteEdits.users(device).filter((user) => user.name !== name)
    return RemoteEdits.setManagement(device, 'users', next.length === 0 ? undefined : next)
  }

  /** Changes the settings of the line group the session is in (console or vty). */
  static updateLine(ctx: CliContext, change: (settings: LineSettings) => LineSettings): CliCommandResult {
    const mode = ctx.mode
    if (mode.kind !== 'line') throw new Error('Line command outside line mode')
    const group = mode.lineType === 'console' ? 'console' : 'vty'
    const device = DeviceEdits.updateManagement(ctx.device, (management) => {
      const lines = assign({ ...management.lines }, group, withoutEmpty(change(management.lines?.[group] ?? {})))
      return assign(management, 'lines', withoutEmpty(lines))
    })
    return { device }
  }

  static setLine<Key extends keyof LineSettings>(settings: LineSettings, key: Key, value: LineSettings[Key] | undefined): LineSettings {
    return assign(settings, key, value)
  }
}
