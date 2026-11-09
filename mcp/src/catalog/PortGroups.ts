// Compact port listing for the model: consecutive ports of the same medium and role in one group,
// e.g. "Fa0/1…Fa0/24 (24× copper switched)".
import type { PortMedium, PortRole } from '../../../src/domain'

interface PortLike {
  id: string
  medium: PortMedium
  role: PortRole
}

export interface PortGroup {
  first: string
  last: string
  count: number
  medium: PortMedium
  role: PortRole
}

export class PortGroups {
  static of(ports: readonly PortLike[]): PortGroup[] {
    const groups: PortGroup[] = []
    for (const port of ports) {
      const current = groups.at(-1)
      if (current !== undefined && current.medium === port.medium && current.role === port.role) {
        current.last = port.id
        current.count += 1
      } else {
        groups.push({ first: port.id, last: port.id, count: 1, medium: port.medium, role: port.role })
      }
    }
    return groups
  }

  static describe(ports: readonly PortLike[]): string {
    return PortGroups.of(ports)
      .map((group) =>
        group.count === 1
          ? `${group.first} (${group.medium} ${group.role})`
          : `${group.first}…${group.last} (${group.count}× ${group.medium} ${group.role})`,
      )
      .join(', ')
  }
}
