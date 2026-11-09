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
