// build_lab (docs/LIVE_LABS.md §7): a whole network in one call, all-or-nothing, one save, one live event.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { createEmptyLab } from '../../../src/lab/createLab'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { BuildPlan, BuildResult } from '../lab/LabBuilder'
import { MAX_MCP_DEVICES } from '../lab/LabTopology'
import type { LiveEventDescription } from '../live/LiveEvent'
import type { OctetlabServices } from '../server/OctetlabServices'
import { cableSchema, cliConfigSchema, coordinateSchema, hostSettingsShape, labIdSchema, nameSchema, portIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

export const MAX_BUILD_DEVICES = MAX_MCP_DEVICES
export const MAX_BUILD_LINKS = 200
export const MAX_BUILD_HOSTS = MAX_MCP_DEVICES
export const MAX_BUILD_CLI = MAX_MCP_DEVICES

const refSchema = z.string().trim().min(1).max(LAB_LIMITS.idLength)
const deviceNameSchema = refSchema.describe('A ref from devices[] of this call, or the id of a device already in the lab')

const buildInput = z.object({
  labId: labIdSchema.optional().describe('Lab to build into; absent = a new lab is created'),
  title: nameSchema.optional().describe('Title of the new lab (only when labId is absent)'),
  devices: z
    .array(
      z.object({
        ref: refSchema.describe('Your name for this device in links / hosts / cli, e.g. "r1", "pos1"'),
        modelId: z.string().min(1).max(64).describe('Catalog model id (list_device_models), e.g. "router3Port", "switch8", "pc"'),
        name: nameSchema.optional(),
        x: coordinateSchema.optional(),
        y: coordinateSchema.optional(),
      }),
    )
    .max(MAX_BUILD_DEVICES)
    .default([]),
  links: z
    .array(
      z.object({
        a: deviceNameSchema,
        b: deviceNameSchema,
        portA: portIdSchema.optional(),
        portB: portIdSchema.optional(),
        cable: cableSchema.default('auto'),
        ssid: nameSchema.optional(),
      }),
    )
    .max(MAX_BUILD_LINKS)
    .default([]),
  hosts: z
    .array(z.object({ deviceId: deviceNameSchema, ...hostSettingsShape }))
    .max(MAX_BUILD_HOSTS)
    .default([])
    .describe('configure_host settings per end device'),
  cli: z
    .array(z.object({ deviceRef: deviceNameSchema, config: cliConfigSchema }))
    .max(MAX_BUILD_CLI)
    .default([])
    .describe('apply_cli_config per router / managed switch'),
})

type BuildInput = z.infer<typeof buildInput>

function planOf(input: BuildInput): BuildPlan {
  return {
    devices: input.devices,
    links: input.links,
    hosts: input.hosts.map(({ deviceId, ...settings }) => ({ device: deviceId, ...settings })),
    cli: input.cli.map(({ deviceRef, config }) => ({ device: deviceRef, config })),
  }
}

export function registerBuildTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  const { builder } = services

  /** The result, or a ToolError listing every failed step (nothing is saved then). */
  const checked = (result: BuildResult): BuildResult => {
    if (result.failures.length === 0) return result
    throw ToolError.validation(
      `build_lab changed nothing: ${result.failures.length} step(s) failed. Fix them and send the whole build again.\n${builder.failureText(result.failures)}`,
      { failures: result.failures },
    )
  }
  const describe = (result: BuildResult): LiveEventDescription => ({
    summary: builder.summary(result),
    deviceIds: [...new Set([...result.devices.map((device) => device.deviceId), ...result.configuredHosts, ...result.configuredDevices])],
    linkIds: result.linkIds,
  })

  server.registerTool(
    'build_lab',
    {
      title: 'Build lab',
      description:
        'Builds a whole network in ONE call (prefer this over many add_device / connect / configure_host / apply_cli_config calls): ' +
        'devices[] (each with your own ref), then links[] (a / b = refs), hosts[] (end-device IP settings) and cli[] (IOS config per router / switch), applied in that order. ' +
        `All-or-nothing: if any step fails nothing is saved and every failed step is listed with its index and reason. Without labId a new lab is created. Limits: ${MAX_BUILD_DEVICES} devices, ${MAX_BUILD_LINKS} links per call. ` +
        'The result has the live link; give it to the user once.',
      inputSchema: buildInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) =>
      responder.respond('build_lab', async () => {
        const plan = planOf(input)
        if (plan.devices.length + plan.links.length + plan.hosts.length + plan.cli.length === 0) {
          throw ToolError.validation('build_lab needs at least one step in devices, links, hosts or cli.')
        }
        let labId = input.labId
        let result: BuildResult
        if (labId === undefined) {
          result = checked(builder.build(createEmptyLab(input.title ?? ''), plan))
          labId = await services.labs.create(result.doc, responder.event('build_lab', describe(result)))
        } else {
          result = await responder.withLab(labId, 'build_lab', (doc) => checked(builder.build(doc, plan)), describe)
        }
        const devices = result.devices.map((device) => `${device.ref} → ${device.deviceId} "${device.name}" (${device.modelId})`)
        const text = [
          `${builder.summary(result)} Lab ${labId}.`,
          ...(input.labId === undefined ? [services.liveLinks.sentence(labId)] : []),
          ...(devices.length === 0 ? [] : ['Devices:', ...devices.map((line) => `  ${line}`)]),
          ...(result.linkIds.length === 0 ? [] : [`Cables: ${result.linkIds.join(', ')}`]),
        ].join('\n')
        return { text, labId, structured: { labId, devices: result.devices, linkIds: result.linkIds } }
      }),
  )
}
