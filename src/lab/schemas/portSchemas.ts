// zod mirror of src/domain/PortTypes.ts. Reserved `never` keys accept only absence; objects are
// strict, so unknown keys are reported instead of silently dropped. labSchemas.test.ts proves at
// compile time that every inferred type equals its domain type.
import { z } from 'zod'
import { firewallInterfaceSchema } from './firewallSchemas'
import { LAB_LIMITS, RESERVED_IDS } from './labLimits'

/** A reserved extension key (`key?: never`): must be absent until its pack gives it a type. */
export const reservedKey = z.never().optional()

/** Ids we reference (devices, ports, links, annotations): non-empty, short, never a prototype key. */
export const idSchema = z
  .string()
  .min(1)
  .max(LAB_LIMITS.idLength)
  .refine((id) => !RESERVED_IDS.has(id), { params: { reason: 'reservedId' } })

/** Names, titles, labels, addresses and other one-line values. */
export const nameSchema = z.string().max(LAB_LIMITS.nameLength)

/** Descriptions and annotation text. */
export const textSchema = z.string().max(LAB_LIMITS.textLength)

/** Any other list of the document. */
export function listOf<Item extends z.ZodType>(item: Item, maximum: number = LAB_LIMITS.listItems) {
  return z.array(item).max(maximum)
}

export const portMediumSchema = z.enum(['copper', 'fiber', 'wireless', 'serial', 'console', 'coaxial'])

export const ipv4SettingsSchema = z.strictObject({
  addressing: z.enum(['static', 'dhcp']),
  address: nameSchema,
  mask: nameSchema,
})

/** Pack 5.2: `ip access-group` / `access-class` (AccessListTypes.AclBinding); values are ACL names. */
export const aclBindingSchema = z.strictObject({ in: nameSchema.optional(), out: nameSchema.optional() })

export const natRoleSchema = z.enum(['inside', 'outside'])

export const l3FeaturesSchema = z.strictObject({
  accessGroups: aclBindingSchema.optional(),
  natRole: natRoleSchema.optional(),
  firewall: firewallInterfaceSchema.optional(),
  ospf: reservedKey,
  rip: reservedKey,
  eigrp: reservedKey,
  hsrp: reservedKey,
})

export const l3SettingsSchema = z.strictObject({
  ipv4: ipv4SettingsSchema,
  helperAddresses: listOf(nameSchema).optional(),
  ipv6: reservedKey,
  features: l3FeaturesSchema.optional(),
})

export const switchportFeaturesSchema = z.strictObject({
  portSecurity: reservedKey,
  stp: reservedKey,
  channelGroup: reservedKey,
  dhcpSnoopingTrusted: reservedKey,
  arpInspectionTrusted: reservedKey,
  voiceVlan: reservedKey,
})

/** VLAN ids are integers; the 1..4094 range is a StateInvariants check (with its own message). */
export const vlanIdSchema = z.number().int()

export const switchportSettingsSchema = z.strictObject({
  mode: z.enum(['access', 'trunk']),
  accessVlan: vlanIdSchema,
  nativeVlan: vlanIdSchema,
  allowedVlans: z.union([z.literal('all'), listOf(vlanIdSchema, LAB_LIMITS.vlans)]),
  features: switchportFeaturesSchema.optional(),
})

export const subInterfaceSchema = z.strictObject({
  id: idSchema,
  vlan: vlanIdSchema,
  native: z.boolean().optional(),
  adminUp: z.boolean(),
  description: textSchema.optional(),
  l3: l3SettingsSchema,
})

export const serialSettingsSchema = z.strictObject({
  clockRate: z.number().int().positive().optional(),
  encapsulation: reservedKey,
})

const portCommonShape = {
  id: idSchema,
  medium: portMediumSchema,
  mac: nameSchema.optional(),
  adminUp: z.boolean(),
  description: textSchema.optional(),
  speed: z.literal(['auto', 10, 100, 1000, 10000]).optional(),
  duplex: z.enum(['auto', 'full', 'half']).optional(),
  autoMdix: z.boolean().optional(),
  pinout: z.enum(['mdi', 'mdix']).optional(),
  poe: z.enum(['auto', 'never']).optional(),
}

export const switchedPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('switched'),
  l2: switchportSettingsSchema,
})

export const routedPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('routed'),
  l3: l3SettingsSchema,
  subInterfaces: listOf(subInterfaceSchema, LAB_LIMITS.subInterfacesPerPort),
  serial: serialSettingsSchema.optional(),
})

export const hostPortSchema = z.strictObject({
  ...portCommonShape,
  role: z.literal('host'),
  l3: l3SettingsSchema,
})

export const radioPortSchema = z.strictObject({ ...portCommonShape, role: z.literal('radio') })
export const consolePortSchema = z.strictObject({ ...portCommonShape, role: z.literal('console') })
export const passivePortSchema = z.strictObject({ ...portCommonShape, role: z.literal('passive') })

export const portSchema = z.discriminatedUnion('role', [
  switchedPortSchema,
  routedPortSchema,
  hostPortSchema,
  radioPortSchema,
  consolePortSchema,
  passivePortSchema,
])
