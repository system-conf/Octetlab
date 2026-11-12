// zod mirror of src/domain/AccessListTypes.ts, NatTypes.ts and the pack 5.2 parts of ManagementTypes.ts
// (docs/SECURITY_PACK.md). Value rules that span entries (unique names, unique seq, number ranges)
// are StateInvariants, not schema rules, so a lab with a mistake still loads and can be fixed.
import { z } from 'zod'
import { listOf, nameSchema } from './portSchemas'

const MAX_SEQ = 2_147_483_647
const portNumber = z.number().int().min(0).max(65_535)

const aclAddressMatchSchema = z.strictObject({ address: nameSchema, wildcard: nameSchema })

const aclPortMatchSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.enum(['eq', 'neq', 'gt', 'lt']), port: portNumber }),
  z.strictObject({ op: z.literal('range'), from: portNumber, to: portNumber }),
])

const aclActionSchema = z.enum(['permit', 'deny'])
const seqSchema = z.number().int().min(1).max(MAX_SEQ)

const aclEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ seq: seqSchema, kind: z.literal('remark'), text: nameSchema }),
  z.strictObject({ seq: seqSchema, kind: z.literal('standard'), action: aclActionSchema, source: aclAddressMatchSchema, log: z.boolean().optional() }),
  z.strictObject({
    seq: seqSchema,
    kind: z.literal('extended'),
    action: aclActionSchema,
    protocol: z.enum(['ip', 'icmp', 'tcp', 'udp']),
    source: aclAddressMatchSchema,
    sourcePort: aclPortMatchSchema.optional(),
    destination: aclAddressMatchSchema,
    destinationPort: aclPortMatchSchema.optional(),
    established: z.boolean().optional(),
    icmpType: z.number().int().min(0).max(255).optional(),
    icmpCode: z.number().int().min(0).max(255).optional(),
    log: z.boolean().optional(),
  }),
])

export const accessListSchema = z.strictObject({
  name: nameSchema.min(1),
  type: z.enum(['standard', 'extended']),
  entries: listOf(aclEntrySchema),
})

export const accessListSettingsSchema = z.strictObject({ lists: listOf(accessListSchema) })

const natPoolSchema = z.strictObject({ name: nameSchema.min(1), start: nameSchema, end: nameSchema, netmask: nameSchema })

const natStaticRuleSchema = z.strictObject({
  kind: z.literal('static'),
  insideLocal: nameSchema,
  insideGlobal: nameSchema,
  protocol: z.enum(['tcp', 'udp']).optional(),
  insideLocalPort: portNumber.optional(),
  insideGlobalPort: portNumber.optional(),
})

const natDynamicRuleSchema = z.strictObject({
  kind: z.literal('dynamic'),
  aclName: nameSchema.min(1),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('pool'), poolName: nameSchema.min(1) }),
    z.strictObject({ kind: z.literal('interface'), interfaceId: nameSchema.min(1) }),
  ]),
  overload: z.boolean(),
})

export const natSettingsSchema = z.strictObject({
  pools: listOf(natPoolSchema),
  statics: listOf(natStaticRuleSchema),
  dynamics: listOf(natDynamicRuleSchema),
})

export const vtyTransportSchema = z.enum(['ssh', 'telnet'])

export const localUserSchema = z.strictObject({
  name: nameSchema.min(1),
  secret: nameSchema.optional(),
  password: nameSchema.optional(),
  privilege: z.number().int().min(0).max(15).optional(),
})

export const sshSettingsSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]).optional(),
  rsaKeyBits: z.number().int().min(360).max(4096).optional(),
  timeoutSeconds: z.number().int().min(1).max(120).optional(),
  authRetries: z.number().int().min(0).max(5).optional(),
})
