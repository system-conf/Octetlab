// create_lab, open_sample, import_share_link, get_lab, share_link: whole labs.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { createEmptyLab } from '../../../src/lab/createLab'
import { MAX_SHARE_URL_LENGTH } from '../lab/ShareLinks'
import type { OctetlabServices } from '../server/OctetlabServices'
import { labIdSchema, nameSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const SAMPLE_ID = z.string().min(1).max(64)

export function registerLabTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  server.registerTool(
    'create_lab',
    {
      title: 'Create lab',
      description: 'Creates an empty lab and returns its labId (kept 7 days after the last change). Then add devices with add_device.',
      inputSchema: z.object({ title: nameSchema.optional().describe('Lab title, e.g. "Office network"') }),
      annotations: { openWorldHint: false },
    },
    ({ title }) =>
      responder.respond('create_lab', async () => {
        const labId = await services.labs.create(createEmptyLab(title ?? ''))
        return { text: `Created lab ${labId}${title === undefined ? '' : ` "${title}"`}.`, structured: { labId } }
      }),
  )

  server.registerTool(
    'open_sample',
    {
      title: 'Open sample lab',
      description: 'Copies a sample lab (see list_samples) into a new lab and returns its labId.',
      inputSchema: z.object({ sampleId: SAMPLE_ID }),
      annotations: { openWorldHint: false },
    },
    ({ sampleId }) =>
      responder.respond('open_sample', async () => {
        const { doc, info } = services.catalog.openSample(sampleId)
        const labId = await services.labs.create(doc)
        return { text: `Opened sample "${info.title}" as lab ${labId}. ${info.summary}`, structured: { labId, sample: info } }
      }),
  )

  server.registerTool(
    'import_share_link',
    {
      title: 'Import share link',
      description: 'Imports an Octetlab share link (https://…/lab#lab=…) as a new lab and returns its labId.',
      inputSchema: z.object({ url: z.string().min(1).max(MAX_SHARE_URL_LENGTH).describe('The full share URL, or just its "#lab=…" part') }),
      annotations: { openWorldHint: false },
    },
    ({ url }) =>
      responder.respond('import_share_link', async () => {
        const doc = services.shareLinks.decode(url)
        const labId = await services.labs.create(doc)
        return { text: `Imported "${doc.meta.title || 'untitled lab'}" as lab ${labId} (${doc.state.devices.length} devices).`, structured: { labId } }
      }),
  )

  server.registerTool(
    'get_lab',
    {
      title: 'Get lab',
      description: 'The lab: devices (id, name, model, power, ports with IP / VLAN / cable status, gateway, DNS), cables and canvas positions.',
      inputSchema: z.object({ labId: labIdSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ labId }) =>
      responder.respond('get_lab', async () => {
        const view = services.summary.view(await services.labs.load(labId))
        return { text: services.summary.text(view), structured: { labId, ...view } }
      }),
  )

  server.registerTool(
    'share_link',
    {
      title: 'Share link',
      description: 'A URL that opens this lab in the Octetlab web app (works on phones too). Fails when the lab is too large to share.',
      inputSchema: z.object({ labId: labIdSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ labId }) =>
      responder.respond('share_link', async () => {
        const url = services.shareLinks.url(await services.labs.load(labId))
        return { text: url, structured: { url } }
      }),
  )
}
