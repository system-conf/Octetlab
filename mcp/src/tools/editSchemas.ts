// zod input pieces of configure_device, edit_annotations and update_lab_info (also build_lab's
// settings[], annotations[] and lab info), and their one-by-one mapping to the editors' requests.
import { z } from 'zod'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { AnnotationFields, NewAnnotation } from '../lab/AnnotationEditor'
import type { DeviceSettingsRequest } from '../lab/DeviceSettingsEditor'
import type { LabInfoRequest } from '../lab/LabInfoEditor'
import { coordinateSchema, ipv4Schema, portIdSchema } from './toolSchemas'

const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema })
const lineText = z.string().max(LAB_LIMITS.nameLength)
const addressList = z.array(ipv4Schema).max(LAB_LIMITS.listItems)

/** Optional fields of an annotation; which ones a type takes is checked by AnnotationEditor. */
export const annotationFieldsShape = {
  at: pointSchema.optional().describe('text / rectangle / ellipse: top-left canvas point'),
  from: pointSchema.optional().describe('line: start point'),
  to: pointSchema.optional().describe('line: end point'),
  text: z.string().max(LAB_LIMITS.textLength).optional().describe('text: the note'),
  size: z.enum(['small', 'medium', 'large']).optional().describe('text: default medium'),
  color: z.enum(['neutral', 'blue', 'green', 'amber', 'red', 'purple']).optional().describe('Default amber for text, neutral otherwise'),
  width: z.number().min(0).max(100_000).optional().describe('rectangle / ellipse'),
  height: z.number().min(0).max(100_000).optional().describe('rectangle / ellipse'),
  label: z.string().max(LAB_LIMITS.textLength).optional().describe('rectangle / ellipse: caption, "" removes it'),
  filled: z.boolean().optional().describe('rectangle / ellipse: default false'),
  arrow: z.boolean().optional().describe('line: arrow head at "to", default false'),
}

export const newAnnotationSchema = z.object({
  type: z.enum(['text', 'rectangle', 'ellipse', 'line']).describe('text needs at + text; rectangle / ellipse need at + width + height; line needs from + to'),
  ...annotationFieldsShape,
})

export const annotationChangeSchema = z.object({ id: z.string().min(1).max(LAB_LIMITS.idLength).describe('Annotation id from get_lab'), ...annotationFieldsShape })

type AnnotationFieldsInput = z.infer<z.ZodObject<typeof annotationFieldsShape>>

export function annotationFieldsOf(input: AnnotationFieldsInput): AnnotationFields {
  return {
    at: input.at,
    from: input.from,
    to: input.to,
    text: input.text,
    size: input.size,
    color: input.color,
    width: input.width,
    height: input.height,
    label: input.label,
    filled: input.filled,
    arrow: input.arrow,
  }
}

export function newAnnotationOf(input: z.infer<typeof newAnnotationSchema>): NewAnnotation {
  return { type: input.type, ...annotationFieldsOf(input) }
}

const dhcpSchema = z.object({
  enabled: z.boolean().optional().describe('Service on / off; absent = unchanged'),
  pools: z
    .array(
      z.object({
        name: lineText.describe('Pool name, unique on the device'),
        network: ipv4Schema.describe('Network address, e.g. 192.168.1.0'),
        mask: ipv4Schema,
        rangeStart: ipv4Schema.optional().describe('Optional first address handed out (with rangeEnd)'),
        rangeEnd: ipv4Schema.optional(),
        defaultRouter: ipv4Schema.optional().describe('Gateway given to clients'),
        dnsServers: addressList.optional(),
      }),
    )
    .max(LAB_LIMITS.listItems)
    .optional()
    .describe('Replaces all pools; a pool keeping its name keeps its leases'),
  excludedRanges: z
    .array(z.object({ start: ipv4Schema, end: ipv4Schema.optional().describe('Absent = a single address') }))
    .max(LAB_LIMITS.listItems)
    .optional()
    .describe('Replaces all excluded addresses'),
})

const dnsSchema = z.object({
  enabled: z.boolean().optional().describe('Service on / off; absent = unchanged'),
  forwarders: addressList.optional().describe('Upstream DNS servers; replaces the list'),
  records: z
    .array(z.object({ name: lineText.describe('Host name, e.g. intranet.local'), address: ipv4Schema }))
    .max(LAB_LIMITS.listItems)
    .optional()
    .describe('A records; replaces the list'),
})

/** configure_device's settings (also a build_lab settings[] step). Absent = unchanged. */
export const deviceSettingsShape = {
  name: lineText.optional().describe('New display name (max 40 characters)'),
  x: coordinateSchema.optional().describe('New canvas position (with y)'),
  y: coordinateSchema.optional(),
  ssids: z
    .array(
      z.object({
        ssid: lineText.describe('Network name, max 32 bytes'),
        vlan: z.number().int().min(1).max(4094).optional().describe('VLAN the SSID is bridged into, default 1'),
        security: z.literal('open').optional().describe('Only open networks exist in Octetlab for now'),
      }),
    )
    .max(LAB_LIMITS.listItems)
    .optional()
    .describe('Access point / wireless router: replaces the SSID list'),
  dhcp: dhcpSchema.optional().describe('DHCP server (routers, servers, wireless routers)'),
  dns: dnsSchema.optional().describe('DNS server (routers, servers, wireless routers)'),
  internetService: z
    .array(z.object({ portId: portIdSchema.describe('Port of the internet cloud'), up: z.boolean().describe('false = ISP outage on that line') }))
    .max(LAB_LIMITS.portsPerDevice)
    .optional()
    .describe('Internet cloud only: service lines to change'),
}

type DeviceSettingsInput = z.infer<z.ZodObject<typeof deviceSettingsShape>>

/** The editor request of a configure_device / build_lab settings input. */
export function deviceSettingsRequestOf(deviceId: string, input: DeviceSettingsInput): DeviceSettingsRequest {
  if ((input.x === undefined) !== (input.y === undefined)) throw ToolError.validation('Give both x and y to move a device.')
  const position = input.x === undefined || input.y === undefined ? undefined : { x: input.x, y: input.y }
  return {
    deviceId,
    name: input.name,
    position,
    ssids: input.ssids?.map((ssid) => ({ ssid: ssid.ssid, vlan: ssid.vlan, security: ssid.security })),
    dhcp:
      input.dhcp === undefined
        ? undefined
        : {
            enabled: input.dhcp.enabled,
            pools: input.dhcp.pools?.map((pool) => ({
              name: pool.name,
              network: pool.network,
              mask: pool.mask,
              rangeStart: pool.rangeStart,
              rangeEnd: pool.rangeEnd,
              defaultRouter: pool.defaultRouter,
              dnsServers: pool.dnsServers,
            })),
            excludedRanges: input.dhcp.excludedRanges?.map((range) => ({ start: range.start, end: range.end })),
          },
    dns:
      input.dns === undefined
        ? undefined
        : {
            enabled: input.dns.enabled,
            forwarders: input.dns.forwarders,
            records: input.dns.records?.map((record) => ({ name: record.name, address: record.address })),
          },
    internetService: input.internetService?.map((line) => ({ portId: line.portId, up: line.up })),
  }
}

/** True when the input asks for no change at all. */
export function isEmptyDeviceSettings(request: DeviceSettingsRequest): boolean {
  return [request.name, request.position, request.ssids, request.dhcp, request.dns, request.internetService].every((part) => part === undefined)
}

/** update_lab_info's fields (build_lab takes description / notes / appendNotes). */
export const labInfoShape = {
  title: z.string().trim().min(1).max(LAB_LIMITS.nameLength).optional().describe('New lab title'),
  description: z.string().max(LAB_LIMITS.textLength).optional().describe('Short description of the lab, "" clears it'),
  notes: z.string().max(LAB_LIMITS.notesLength).optional().describe("Replaces the lab's notebook text"),
  appendNotes: z.string().min(1).max(LAB_LIMITS.notesLength).optional().describe('Adds this text at the end of the notes, on a new line'),
}

type LabInfoInput = z.infer<z.ZodObject<typeof labInfoShape>>

export function labInfoRequestOf(input: Partial<LabInfoInput>): LabInfoRequest {
  return { title: input.title, description: input.description, notes: input.notes, appendNotes: input.appendNotes }
}
