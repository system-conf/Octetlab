// Pack 5.2 invariants (docs/SECURITY_PACK.md §4): what the ACL / NAT / local-user data must satisfy
// beyond its zod schema. A binding that names a missing ACL or pool stays valid (IOS accepts it).
import type { AccessList } from './AccessListTypes'
import type { Device } from './DeviceTypes'
import { SECURITY_LEVEL_MAX, SECURITY_LEVEL_MIN, type FirewallInterfaceSettings } from './FirewallTypes'

export type SecurityInvariantCode =
  /** Two access lists of one device share a name. */
  | 'duplicateAclName'
  /** A numbered list's number is outside the range of its type (standard 1-99 / 1300-1999, extended 100-199 / 2000-2699). */
  | 'aclNumberOutOfRange'
  /** Two entries of one list share a sequence number. */
  | 'duplicateAclSeq'
  /** Two NAT pools of one device share a name. */
  | 'duplicateNatPool'
  /** Two local users of one device share a name. */
  | 'duplicateUser'
  /** Firewall pack: two interfaces of one device share a `nameif`. */
  | 'duplicateNameif'
  /** Firewall pack: a `security-level` outside 0..100 (`name` is the nameif). */
  | 'securityLevelOutOfRange'

export interface SecurityViolation {
  code: SecurityInvariantCode
  deviceId: string
  /** The list, pool or user name concerned. */
  name: string
}

const NUMBER_RANGES: Record<AccessList['type'], ReadonlyArray<readonly [number, number]>> = {
  standard: [
    [1, 99],
    [1300, 1999],
  ],
  extended: [
    [100, 199],
    [2000, 2699],
  ],
}

function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const value of values) (seen.has(value) ? twice : seen).add(value)
  return [...twice]
}

export class SecurityInvariants {
  /** True when `name` is a numbered list name ('10', '101'). */
  static isNumbered(name: string): boolean {
    return /^[0-9]+$/.test(name)
  }

  /** True when a numbered name lies in the ranges of `type`; named lists always fit. */
  static numberFits(name: string, type: AccessList['type']): boolean {
    if (!SecurityInvariants.isNumbered(name)) return true
    const number = Number(name)
    return NUMBER_RANGES[type].some(([low, high]) => number >= low && number <= high)
  }

  violations(device: Device): SecurityViolation[] {
    const deviceId = device.id
    const found: SecurityViolation[] = []
    const lists = device.features?.accessLists?.lists ?? []
    for (const name of repeated(lists.map((list) => list.name))) found.push({ code: 'duplicateAclName', deviceId, name })
    for (const list of lists) {
      if (!SecurityInvariants.numberFits(list.name, list.type)) found.push({ code: 'aclNumberOutOfRange', deviceId, name: list.name })
      if (repeated(list.entries.map((entry) => String(entry.seq))).length > 0) found.push({ code: 'duplicateAclSeq', deviceId, name: list.name })
    }
    const pools = device.features?.nat?.pools ?? []
    for (const name of repeated(pools.map((pool) => pool.name))) found.push({ code: 'duplicateNatPool', deviceId, name })
    const users = device.features?.management?.users ?? []
    for (const name of repeated(users.map((user) => user.name))) found.push({ code: 'duplicateUser', deviceId, name })
    found.push(...this.firewallViolations(device))
    return found
  }

  /** Firewall pack: nameif unique per device, security level within 0..100. */
  private firewallViolations(device: Device): SecurityViolation[] {
    const deviceId = device.id
    const interfaces: FirewallInterfaceSettings[] = []
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      for (const l3 of [port.l3, ...port.subInterfaces.map((sub) => sub.l3)]) {
        const settings = l3.features?.firewall
        if (settings !== undefined) interfaces.push(settings)
      }
    }
    const found: SecurityViolation[] = []
    for (const name of repeated(interfaces.map((settings) => settings.nameif))) found.push({ code: 'duplicateNameif', deviceId, name })
    for (const settings of interfaces) {
      const level = settings.securityLevel
      if (level !== undefined && (!Number.isInteger(level) || level < SECURITY_LEVEL_MIN || level > SECURITY_LEVEL_MAX)) {
        found.push({ code: 'securityLevelOutOfRange', deviceId, name: settings.nameif })
      }
    }
    return found
  }
}
