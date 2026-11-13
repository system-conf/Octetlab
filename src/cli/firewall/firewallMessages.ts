// Device filter and error texts of the firewall command set. Real appliance wording for these errors could
// not be confirmed (docs/FIREWALL_PACK.md §3), so every text here is a plain lab text (UNVERIFIED as to
// the real device) and never names a vendor.
import type { Device } from '../../domain'

/** `when` of every firewall-only node (§6.2). */
export function isFirewall(device: Device): boolean {
  return device.kind === 'firewall'
}

export const FIREWALL_ERRORS = {
  notRouted: '% This command applies to routed interfaces only',
  badNameif: (name: string): string => `% Invalid interface name "${name}"`,
  nameifUsed: (name: string): string => `% Name "${name}" is used by another interface`,
  levelNeedsNameif: '% Configure nameif before security-level',
  unknownNameif: (name: string): string => `% Interface name "${name}" not found`,
  badMask: (mask: string): string => `% Invalid netmask ${mask}`,
  addressMaskPair: (address: string, mask: string): string => `% IP address,mask ${address},${mask} doesn't pair`,
  badAclName: (name: string): string => `% Invalid access list name "${name}"`,
  aclTypeConflict: '% Access-list type conflicts with existing type',
  badAclEntry: (detail: string): string => `% Invalid access list entry (${detail})`,
  badTimeout: (value: string): string => `% Invalid timeout "${value}", use h:mm:ss`,
  badObjectName: (name: string): string => `% Invalid object name "${name}"`,
  natInterfacePair: '% Use the form (real_ifc,mapped_ifc)',
  objectWithoutAddress: (name: string): string => `% Object ${name} has no host or subnet`,
  staticNeedsHost: '% Static NAT of a subnet object is not supported in this lab; use a host object',
  noSuchObject: (name: string): string => `% Object ${name} does not exist`,
  inconsistentRoute: '% Inconsistent address and mask',
  noMatchingRoute: '% No matching route to delete',
} as const
