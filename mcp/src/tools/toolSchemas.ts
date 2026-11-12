// zod pieces shared by the tool input schemas (every tool input is validated at the boundary).
import { z } from 'zod'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { LAB_ID_PATTERN } from '../store/LabStore'

export const labIdSchema = z.string().regex(LAB_ID_PATTERN, 'labId is the 22-character id returned by create_lab, open_sample or import_share_link').describe('Lab id from create_lab / open_sample / import_share_link')

export const deviceIdSchema = z.string().min(1).max(LAB_LIMITS.idLength).describe('Device id from get_lab or add_device, e.g. "router1", "pc2"')

export const portIdSchema = z.string().min(1).max(LAB_LIMITS.idLength)

export const nameSchema = z.string().trim().min(1).max(LAB_LIMITS.nameLength)

export const ipv4Schema = z.string().max(15).describe('Dotted IPv4 address, e.g. 192.168.1.10')

export const coordinateSchema = z.number().min(-100_000).max(100_000)

export const cableSchema = z.enum(['auto', 'copperStraight', 'copperCross', 'fiber', 'serial', 'console', 'coaxial', 'wireless'])

/** IOS configuration text of one apply_cli_config call / build_lab cli step. */
export const cliConfigSchema = z
  .string()
  .min(1)
  .max(50_000)
  .describe('Config lines separated by newlines, e.g. "interface Gi0/0\\n ip address 192.168.1.1 255.255.255.0\\n no shutdown"')

/** configure_host's settings (also a build_lab hosts[] step). */
export const hostSettingsShape = {
  portId: portIdSchema.optional().describe('Network card, default the first one (eth0)'),
  mode: z.enum(['dhcp', 'static']),
  ip: ipv4Schema.optional().describe('Static mode: address'),
  mask: ipv4Schema.optional().describe('Static mode: mask, e.g. 255.255.255.0'),
  gateway: ipv4Schema.or(z.literal('')).optional(),
  dnsServers: z.array(ipv4Schema).max(LAB_LIMITS.listItems).optional(),
}
