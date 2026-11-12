// Device management settings of IOS-style devices (Phase 4, docs/CLI.md §5): what `hostname`,
// `enable secret`, `line …`, `banner motd` and `copy running-config startup-config` configure.
// Optional and additive: a device without `features.management` has the IOS factory values.
import type { AclBinding } from './AccessListTypes'

/** Settings of one terminal line group (`line con 0`, `line vty 0 4`). */
export interface LineSettings {
  /**
   * `password <text>`; absent = none. Stored as typed (a lab is no security boundary);
   * `service password-encryption` only changes how running-config shows it (type 7).
   */
  password?: string
  /** `login` / `no login`; absent = IOS default (console: no login, vty: login). */
  login?: boolean
  /** `exec-timeout <minutes> [<seconds>]`; absent = 10 0. 0 0 = never. */
  execTimeout?: { minutes: number; seconds: number }
  /** `logging synchronous`; absent = false. */
  loggingSynchronous?: boolean
  /** vty only: `transport input ssh|telnet|all|none`; absent = all ([] = none). */
  transportInput?: VtyTransport[]
  /** `login local` (authenticate against `users`); handlers keep it exclusive with `login`. */
  loginLocal?: boolean
  /** vty only: `access-class <acl> in|out`. */
  accessClass?: AclBinding
}

export type VtyTransport = 'ssh' | 'telnet'

/** `username <name> [privilege n] secret|password <text>`; stored as typed (a lab is no security boundary). */
export interface LocalUser {
  name: string
  secret?: string
  password?: string
  /** 0..15; absent = 1. */
  privilege?: number
}

/** SSH server settings (`ip ssh …`, `crypto key generate rsa`). */
export interface SshSettings {
  /** `ip ssh version 1|2`; absent = both (shown as "1.99"). */
  version?: 1 | 2
  /** Modulus of the generated RSA key pair, 360..4096; absent = no keys (SSH disabled). Survives reload. */
  rsaKeyBits?: number
  /** `ip ssh time-out`; absent = 120. */
  timeoutSeconds?: number
  /** `ip ssh authentication-retries`; absent = 3. */
  authRetries?: number
}

export interface LineGroups {
  /** `line con 0`. */
  console?: LineSettings
  /** Every vty line (`line vty 0 4` and `line vty 5 15` share one settings object in the lab). */
  vty?: LineSettings
}

/** `DeviceFeatures.management` (MODEL_V2 §8). Every key is optional: absent = IOS factory value. */
export interface ManagementSettings {
  /** `hostname`; absent = platform default ('Router' for routers, 'Switch' for switches). */
  hostname?: string
  /** `enable secret`, stored as typed; running-config shows a lab-only MD5-style string. */
  enableSecret?: string
  /** `enable password` (used only when no enable secret is set, like IOS). */
  enablePassword?: string
  /** `service password-encryption`; absent = false. */
  passwordEncryption?: boolean
  /** `banner motd`: text shown before login; lines separated by '\n'. */
  bannerMotd?: string
  /** `ip domain-lookup`; absent = true (IOS default: unknown words are looked up as host names). */
  domainLookup?: boolean
  lines?: LineGroups
  /**
   * NVRAM `startup-config` as IOS text (lines separated by '\n', from `!`/`version` to `end`), written by
   * `copy running-config startup-config` / `write memory`; absent = never saved ("startup-config is not
   * present"). `reload` replays it on the factory configuration.
   */
  startupConfig?: string
  /** `ip domain-name` / `ip domain name` (pack 5.2). */
  domainName?: string
  /** Local user database (`username …`), used by `login local`. */
  users?: LocalUser[]
  ssh?: SshSettings
}
