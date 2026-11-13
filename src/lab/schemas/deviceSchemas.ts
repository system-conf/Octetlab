// zod mirror of src/domain/DeviceTypes.ts (see portSchemas.ts for the conventions).
import { z } from 'zod'
import type { DeviceKind } from '../../domain'
import { firewallSettingsSchema } from './firewallSchemas'
import { LAB_LIMITS } from './labLimits'
import { aclBindingSchema, idSchema, l3SettingsSchema, listOf, nameSchema, portSchema, reservedKey, textSchema, vlanIdSchema } from './portSchemas'
import { accessListSettingsSchema, localUserSchema, natSettingsSchema, sshSettingsSchema, vtyTransportSchema } from './securitySchemas'
import { deviceServicesSchema, internetSettingsSchema } from './serviceSchemas'

/** Every DeviceKind (the type-equality test fails when the domain union gains a member). */
export const DEVICE_KINDS = [
  'internet',
  'router',
  'wirelessRouter',
  'switch',
  'l3Switch',
  'hub',
  'accessPoint',
  'pc',
  'laptop',
  'server',
  'printer',
  'ipPhone',
  'pos',
  'camera',
  'nvr',
  'kitchenDisplay',
  'smartphone',
  'tablet',
  'firewall',
] as const satisfies readonly DeviceKind[]

export const deviceKindSchema = z.enum(DEVICE_KINDS)

export const appLinkSchema = z.strictObject({
  id: idSchema,
  label: nameSchema,
  targetIp: nameSchema,
  targetKind: deviceKindSchema,
})

export const hostSettingsSchema = z.strictObject({
  defaultGateway: nameSchema,
  dnsServers: listOf(nameSchema),
  appLinks: listOf(appLinkSchema),
})

export const vlanEntrySchema = z.strictObject({ id: vlanIdSchema, name: nameSchema })

export const sviSchema = z.strictObject({
  vlan: vlanIdSchema,
  adminUp: z.boolean(),
  description: textSchema.optional(),
  l3: l3SettingsSchema,
})

export const switchingFeaturesSchema = z.strictObject({
  stp: reservedKey,
  vtp: reservedKey,
  dhcpSnooping: reservedKey,
  arpInspection: reservedKey,
})

export const switchingSettingsSchema = z.strictObject({
  vlans: listOf(vlanEntrySchema, LAB_LIMITS.vlans),
  svis: listOf(sviSchema, LAB_LIMITS.vlans),
  defaultGateway: nameSchema,
  features: switchingFeaturesSchema.optional(),
})

const staticRouteBaseShape = {
  prefix: nameSchema,
  mask: nameSchema,
  adminDistance: z.number().int().min(0).max(255),
}

export const staticRouteSchema = z.union([
  z.strictObject({ ...staticRouteBaseShape, nextHop: nameSchema, exitInterfaceId: nameSchema.optional() }),
  z.strictObject({ ...staticRouteBaseShape, nextHop: reservedKey, exitInterfaceId: nameSchema }),
])

export const routingFeaturesSchema = z.strictObject({
  rip: reservedKey,
  ospf: reservedKey,
  eigrp: reservedKey,
  bgp: reservedKey,
})

export const routingSettingsSchema = z.strictObject({
  ipRouting: z.boolean(),
  staticRoutes: listOf(staticRouteSchema),
  features: routingFeaturesSchema.optional(),
})

export const wirelessSecuritySchema = z.strictObject({ mode: z.literal('open') })

export const ssidSettingsSchema = z.strictObject({
  ssid: nameSchema,
  vlan: vlanIdSchema,
  security: wirelessSecuritySchema,
})

export const wirelessSettingsSchema = z.strictObject({
  ssids: listOf(ssidSettingsSchema),
  radio: reservedKey,
})

// K4 (Phase 4 CLI): mirror of src/domain/ManagementTypes.ts. NVRAM text is longer than other texts.
const STARTUP_CONFIG_LENGTH = 65_536

const lineSettingsSchema = z.strictObject({
  password: nameSchema.optional(),
  login: z.boolean().optional(),
  execTimeout: z.strictObject({ minutes: z.number().int().min(0), seconds: z.number().int().min(0) }).optional(),
  loggingSynchronous: z.boolean().optional(),
  transportInput: listOf(vtyTransportSchema, 2).optional(),
  loginLocal: z.boolean().optional(),
  accessClass: aclBindingSchema.optional(),
})

export const managementSettingsSchema = z.strictObject({
  hostname: nameSchema.optional(),
  enableSecret: nameSchema.optional(),
  enablePassword: nameSchema.optional(),
  passwordEncryption: z.boolean().optional(),
  bannerMotd: textSchema.optional(),
  domainLookup: z.boolean().optional(),
  lines: z.strictObject({ console: lineSettingsSchema.optional(), vty: lineSettingsSchema.optional() }).optional(),
  startupConfig: z.string().max(STARTUP_CONFIG_LENGTH).optional(),
  domainName: nameSchema.optional(),
  users: listOf(localUserSchema).optional(),
  ssh: sshSettingsSchema.optional(),
})

export const deviceFeaturesSchema = z.strictObject({
  management: managementSettingsSchema.optional(),
  accessLists: accessListSettingsSchema.optional(),
  nat: natSettingsSchema.optional(),
  firewall: firewallSettingsSchema.optional(),
  discovery: reservedKey,
  monitoring: reservedKey,
})

export const deviceSchema = z.strictObject({
  id: idSchema,
  kind: deviceKindSchema,
  modelId: idSchema,
  name: nameSchema,
  powered: z.boolean(),
  baseMac: nameSchema,
  ports: listOf(portSchema, LAB_LIMITS.portsPerDevice),
  host: hostSettingsSchema.optional(),
  switching: switchingSettingsSchema.optional(),
  routing: routingSettingsSchema.optional(),
  wireless: wirelessSettingsSchema.optional(),
  services: deviceServicesSchema.optional(),
  internet: internetSettingsSchema.optional(),
  features: deviceFeaturesSchema.optional(),
})
