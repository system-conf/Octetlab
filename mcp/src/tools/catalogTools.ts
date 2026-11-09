// list_device_models, list_samples: what can be built.
import type { McpServer } from '@modelcontextprotocol/server'
import type { DeviceCategory } from '../../../src/domain'
import { z } from 'zod'
import { CatalogBrowser } from '../catalog/CatalogBrowser'
import type { OctetlabServices } from '../server/OctetlabServices'
import type { ToolResponder } from './ToolResponder'

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
const categorySchema = z.enum(['routers', 'switches', 'wireless', 'endDevices', 'servers', 'wan'] satisfies DeviceCategory[])

export function registerCatalogTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  server.registerTool(
    'list_device_models',
    {
      title: 'List device models',
      description: 'Octetlab device catalog: model ids for add_device, with kind, ports and capabilities. Optional category filter.',
      inputSchema: z.object({ category: categorySchema.optional().describe(`One of: ${CatalogBrowser.categories.join(', ')}`) }),
      annotations: READ_ONLY,
    },
    ({ category }) =>
      responder.respond('list_device_models', () => {
        const models = services.catalog.models(category)
        const text = models.map((model) => `- ${model.modelId} (${model.kind}): ${model.name}. Ports: ${model.ports}`).join('\n')
        return { text: text === '' ? 'No models in that category.' : text, structured: { models } }
      }),
  )

  server.registerTool(
    'list_samples',
    {
      title: 'List sample labs',
      description: 'Ready-made, working sample labs (id, category, level, English title). Open one with open_sample.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () =>
      responder.respond('list_samples', () => {
        const samples = services.catalog.sampleList()
        const text = samples.map((sample) => `- ${sample.sampleId} [${sample.category}, ${sample.level}]: ${sample.title}`).join('\n')
        return { text, structured: { samples } }
      }),
  )
}
