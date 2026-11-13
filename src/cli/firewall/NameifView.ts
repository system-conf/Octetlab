// `show nameif`: interfaces with a name and their security level. Header and sample rows from the
// appliance command reference ("Interface Name Security", "GigabitEthernet0/0 outside 0",
// https://www3-realm.cisco.com/en/US/docs/security/asa/command-reference/s10.html); column widths are
// lab values. Interfaces without a nameif are not listed (they show neither name nor level).
import type { Device } from '../../domain'
import { InterfaceNames } from '../core/InterfaceNames'
import { FirewallInterfaces } from './FirewallInterfaces'

const NAME_COLUMN = 25
const LEVEL_WIDTH = 3

export class NameifView {
  static lines(device: Device): string[] {
    const rows = FirewallInterfaces.named(device).map(
      (named) => `${InterfaceNames.longName(named.iface.id).padEnd(NAME_COLUMN)}${named.nameif.padEnd(NAME_COLUMN)}${String(named.level).padStart(LEVEL_WIDTH)}`,
    )
    return [`${'Interface'.padEnd(NAME_COLUMN)}${'Name'.padEnd(NAME_COLUMN)}Security`, ...rows]
  }
}
