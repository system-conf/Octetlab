// The nameif view of a firewall's interfaces (docs/FIREWALL_PACK.md §4): which interface carries which
// name and security level. Read-only helpers for commands, views and packet-tracer.
import { SECURITY_LEVEL_MAX, type Device, type FirewallInterfaceSettings, type L3Settings } from '../../domain'
import type { CliInterface } from '../contract'
import { AclInterfaces } from '../acl/AclInterfaces'
import { DeviceInterfaces } from '../core/DeviceInterfaces'

/** The name that gets level 100 when no level is typed (verified, docs/FIREWALL_PACK.md §3). */
export const INSIDE_NAME = 'inside'
const DEFAULT_LEVEL = 0

/** An interface with a nameif. */
export interface NamedInterface {
  readonly iface: CliInterface
  readonly l3: L3Settings
  readonly nameif: string
  readonly level: number
}

export class FirewallInterfaces {
  static settingsOf(iface: CliInterface): FirewallInterfaceSettings | undefined {
    return AclInterfaces.l3Of(iface)?.features?.firewall
  }

  /** Effective level of a settings block: absent = 0, or 100 for 'inside' (D8). */
  static levelOf(settings: FirewallInterfaceSettings): number {
    if (settings.securityLevel !== undefined) return settings.securityLevel
    return settings.nameif === INSIDE_NAME ? SECURITY_LEVEL_MAX : DEFAULT_LEVEL
  }

  /** Interfaces with a nameif, in device order. */
  static named(device: Device): NamedInterface[] {
    const named: NamedInterface[] = []
    for (const iface of DeviceInterfaces.list(device)) {
      const l3 = AclInterfaces.l3Of(iface)
      const settings = l3?.features?.firewall
      if (l3 === undefined || settings === undefined) continue
      named.push({ iface, l3, nameif: settings.nameif, level: FirewallInterfaces.levelOf(settings) })
    }
    return named
  }

  /** The interface named `nameif` (exact, as appliances compare names). */
  static byName(device: Device, nameif: string): NamedInterface | undefined {
    return FirewallInterfaces.named(device).find((named) => named.nameif === nameif)
  }

  /** The interface with this id, if it has a nameif. */
  static byId(device: Device, interfaceId: string): NamedInterface | undefined {
    return FirewallInterfaces.named(device).find((named) => named.iface.id === interfaceId)
  }
}
