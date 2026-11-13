// zod mirror of src/domain/FirewallTypes.ts (docs/FIREWALL_PACK.md §3). The level range is checked
// here; unique nameifs are a SecurityInvariants rule so a lab with a mistake still loads.
import { z } from 'zod'
import { SECURITY_LEVEL_MAX, SECURITY_LEVEL_MIN } from '../../domain/FirewallTypes'
import { LAB_LIMITS } from './labLimits'

// Not imported from portSchemas: portSchemas imports this file (L3Features.firewall).
const nameSchema = z.string().max(LAB_LIMITS.nameLength)

/** Longest timeout accepted: one week in seconds. */
const MAX_TIMEOUT_SECONDS = 604_800
const timeoutSchema = z.number().int().min(0).max(MAX_TIMEOUT_SECONDS)

export const firewallInterfaceSchema = z.strictObject({
  nameif: nameSchema.min(1),
  securityLevel: z.number().int().min(SECURITY_LEVEL_MIN).max(SECURITY_LEVEL_MAX).optional(),
})

export const firewallTimeoutsSchema = z.strictObject({
  tcp: timeoutSchema.optional(),
  halfClosed: timeoutSchema.optional(),
  udp: timeoutSchema.optional(),
  icmp: timeoutSchema.optional(),
})

export const firewallSettingsSchema = z.strictObject({
  sameSecurityInterInterface: z.boolean().optional(),
  sameSecurityIntraInterface: z.boolean().optional(),
  inspectIcmp: z.boolean().optional(),
  timeouts: firewallTimeoutsSchema.optional(),
})
