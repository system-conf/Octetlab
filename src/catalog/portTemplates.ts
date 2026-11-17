// Builders for the port templates of the catalog models (docs/MODEL_V2.md §7).
import type { PortMedium, PortRole, PortTemplate } from '../domain'

/**
 * Strip layout group of a port template (`PortTemplate.group`): where the port sits on the front
 * panel and which short description the UI shows (`catalog:portGroups.<group>`).
 */
export const PORT_GROUPS = [
  'lan',
  'wan',
  'ethernet',
  'dmz',
  'serial',
  'access',
  'uplink',
  'shared',
  'handoff',
  'nic',
  'wireless',
  'console',
] as const

export type PortGroup = (typeof PORT_GROUPS)[number]

export function isPortGroup(value: string | undefined): value is PortGroup {
  return PORT_GROUPS.some((group) => group === value)
}

/** A catalog port template: the group is always set. */
export interface CatalogPortTemplate extends PortTemplate {
  group: PortGroup
}

/** Supported speeds in Mbit/s (ascending), per port type. */
export const PORT_SPEEDS = {
  fastEthernet: [10, 100],
  gigabit: [10, 100, 1000],
  gigabitFiber: [1000],
  wifi: [54, 300, 867],
  none: [],
} as const satisfies Record<string, readonly number[]>

export function portTemplate(
  id: string,
  medium: PortMedium,
  role: PortRole,
  speedsMbps: readonly number[],
  group: PortGroup,
  poe = false,
): CatalogPortTemplate {
  return { id, medium, role, speedsMbps, group, ...(poe ? { poe: true } : {}) }
}

/** `<prefix><first>` … `<prefix><last>`, e.g. Fa0/1 … Fa0/24. */
export function numberedPorts(
  prefix: string,
  first: number,
  last: number,
  make: (id: string) => CatalogPortTemplate,
): CatalogPortTemplate[] {
  const ports: CatalogPortTemplate[] = []
  for (let number = first; number <= last; number += 1) ports.push(make(`${prefix}${number}`))
  return ports
}

export function consoleTemplate(id = 'Console'): CatalogPortTemplate {
  return portTemplate(id, 'console', 'console', PORT_SPEEDS.none, 'console')
}

export function wiredNic(id: string): CatalogPortTemplate {
  return portTemplate(id, 'copper', 'host', PORT_SPEEDS.gigabit, 'nic')
}

export function wirelessNic(id = 'wlan0'): CatalogPortTemplate {
  return portTemplate(id, 'wireless', 'host', PORT_SPEEDS.wifi, 'wireless')
}

export function radioTemplate(id = 'Radio0'): CatalogPortTemplate {
  return portTemplate(id, 'wireless', 'radio', PORT_SPEEDS.wifi, 'wireless')
}
