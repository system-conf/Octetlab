// Read-only questions about a firewall's configuration (docs/FIREWALL_PACK.md §2, §4): which interface
// has which nameif and security level, which ACLs it binds, the device-wide switches and timeouts with
// their documented defaults. Pure over the Device, so FirewallRules (packet-tracer) uses it too.
import { type AclBinding, type Device, type FirewallSettings, SECURITY_LEVEL_MAX, SECURITY_LEVEL_MIN } from '../../../domain'
import { AclBindings } from '../acl/AclBindings'

/** An interface that has a nameif, with its effective level (D8) and its access-group binding. */
export interface FirewallInterface {
  readonly id: string
  readonly nameif: string
  readonly level: number
  readonly accessGroups: AclBinding | undefined
}

/** Idle timeouts in virtual ms; `null` = the entry never idles out (a configured 0). */
export interface FirewallTimeoutsMs {
  readonly tcp: number | null
  readonly halfClosed: number | null
  readonly udp: number | null
  readonly icmp: number | null
}

/** D10 defaults in seconds. */
export const FIREWALL_DEFAULT_TIMEOUTS = { tcp: 3600, halfClosed: 600, udp: 120, icmp: 2 } as const

/** nameif whose level defaults to 100 (D8). */
const INSIDE_NAMEIF = 'inside'
const NO_SETTINGS: FirewallSettings = {}

function toMs(seconds: number): number | null {
  return seconds === 0 ? null : seconds * 1000
}

export class FirewallConfig {
  /** True for a firewall appliance; tolerates a missing device (the prelude chain test). */
  static isFirewall(device: Device | undefined): device is Device {
    return device?.kind === 'firewall'
  }

  static settingsOf(device: Device): FirewallSettings {
    return device.features?.firewall ?? NO_SETTINGS
  }

  /** The interface by id, or null when it has no nameif (it then carries no traffic, D3). */
  static interfaceOf(device: Device, interfaceId: string): FirewallInterface | null {
    const features = AclBindings.l3Of(device, interfaceId)?.features
    const settings = features?.firewall
    if (settings === undefined || settings.nameif === '') return null
    return {
      id: interfaceId,
      nameif: settings.nameif,
      level: FirewallConfig.levelOf(settings.nameif, settings.securityLevel),
      accessGroups: features?.accessGroups,
    }
  }

  /** D8: absent = 0, except `inside` = 100; out-of-range values are clamped (the invariant reports them). */
  static levelOf(nameif: string, securityLevel: number | undefined): number {
    const level = securityLevel ?? (nameif === INSIDE_NAMEIF ? SECURITY_LEVEL_MAX : SECURITY_LEVEL_MIN)
    return Math.min(SECURITY_LEVEL_MAX, Math.max(SECURITY_LEVEL_MIN, level))
  }

  /** D2: ICMP echo is tracked unless `inspectIcmp` is explicitly false. */
  static inspectsIcmp(settings: FirewallSettings): boolean {
    return settings.inspectIcmp !== false
  }

  static timeoutsOf(settings: FirewallSettings): FirewallTimeoutsMs {
    const configured = settings.timeouts ?? {}
    return {
      tcp: toMs(configured.tcp ?? FIREWALL_DEFAULT_TIMEOUTS.tcp),
      halfClosed: toMs(configured.halfClosed ?? FIREWALL_DEFAULT_TIMEOUTS.halfClosed),
      udp: toMs(configured.udp ?? FIREWALL_DEFAULT_TIMEOUTS.udp),
      icmp: toMs(configured.icmp ?? FIREWALL_DEFAULT_TIMEOUTS.icmp),
    }
  }
}
