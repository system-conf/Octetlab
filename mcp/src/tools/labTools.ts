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
      description:
        'Creates an empty lab and returns its labId (kept 7 days after the last change) and its live link (give it to the user once: the lab redraws in their browser as you work). ' +
        'To create and fill a lab in one call, use build_lab without labId instead.',
      inputSchema: z.object({ title: nameSchema.optional().describe('Lab title, e.g. "Office network"') }),
      annotations: { openWorldHint: false },
    },
    ({ title }) =>
      responder.respond('create_lab', async () => {
        const summary = title === undefined ? 'Created an empty lab.' : `Created the empty lab "${title}".`
        const labId = await services.labs.create(createEmptyLab(title ?? ''), responder.event('create_lab', { summary, deviceIds: [], linkIds: [] }))
        return { text: `Created lab ${labId}${title === undefined ? '' : ` "${title}"`}. ${services.liveLinks.sentence(labId)}`, labId, structured: { labId } }
      }),
  )

  server.registerTool(
    'open_sample',
    {
      title: 'Open sample lab',
      description: 'Copies a sample lab (see list_samples) into a new lab and returns its labId and live link.',
      inputSchema: z.object({ sampleId: SAMPLE_ID }),
      annotations: { openWorldHint: false },
    },
    ({ sampleId }) =>
      responder.respond('open_sample', async () => {
        const { doc, info } = services.catalog.openSample(sampleId)
        const event = responder.event('open_sample', { summary: `Opened the sample "${info.title}".`, deviceIds: [], linkIds: [] })
        const labId = await services.labs.create(doc, event)
        return { text: `Opened sample "${info.title}" as lab ${labId}. ${info.summary}\n${services.liveLinks.sentence(labId)}`, labId, structured: { labId, sample: info } }
      }),
  )

  server.registerTool(
    'import_share_link',
    {
      title: 'Import share link',
      description: 'Imports an Octetlab share link (https://…/lab#lab=…) as a new lab and returns its labId and live link.',
      inputSchema: z.object({ url: z.string().min(1).max(MAX_SHARE_URL_LENGTH).describe('The full share URL, or just its "#lab=…" part') }),
      annotations: { openWorldHint: false },
    },
    ({ url }) =>
      responder.respond('import_share_link', async () => {
        const doc = services.shareLinks.decode(url)
        const title = doc.meta.title || 'untitled lab'
        const event = responder.event('import_share_link', { summary: `Imported "${title}" from a share link.`, deviceIds: [], linkIds: [] })
        const labId = await services.labs.create(doc, event)
        return { text: `Imported "${title}" as lab ${labId} (${doc.state.devices.length} devices). ${services.liveLinks.sentence(labId)}`, labId, structured: { labId } }
      }),
  )

  server.registerTool(
    'get_lab',
    {
      title: 'Get lab',
      description:
        'The lab: title, description, notes; devices (id, name, model, power, canvas position, ports with IP / VLAN / cable status, gateway, DNS, and settings: SSIDs, DHCP / DNS server, ISP service lines); cables (plugged or not); canvas annotations.',
      inputSchema: z.object({ labId: labIdSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ labId }) =>
      responder.respond('get_lab', async () => {
        const view = services.summary.view(await services.labs.load(labId))
        return { text: services.summary.text(view), labId, structured: { labId, ...view } }
      }),
  )

  server.registerTool(
    'share_link',
    {
      title: 'Share link',
      description:
        'A frozen snapshot URL that opens a copy of this lab in the Octetlab web app (works on phones too; later changes are not in it — the live link is). Fails when the lab is too large to share.',
      inputSchema: z.object({ labId: labIdSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ labId }) =>
      responder.respond('share_link', async () => {
        const url = services.shareLinks.url(await services.labs.load(labId))
        return { text: url, labId, structured: { url } }
      }),
  )
}
