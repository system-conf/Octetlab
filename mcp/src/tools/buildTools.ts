// build_lab (docs/LIVE_LABS.md §7): a whole network in one call, all-or-nothing, one save, one live event.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { LabDocument } from '../../../src/domain'
import { createEmptyLab } from '../../../src/lab/createLab'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { LeaseOutcome } from '../lab/DhcpLeases'
import type { BuildPlan, BuildResult } from '../lab/LabBuilder'
import { MAX_MCP_DEVICES } from '../lab/LabTopology'
import type { LiveEventDescription } from '../live/LiveEvent'
import type { OctetlabServices } from '../server/OctetlabServices'
import { deviceSettingsRequestOf, deviceSettingsShape, labInfoRequestOf, labInfoShape, newAnnotationOf, newAnnotationSchema } from './editSchemas'
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
  settings: z
    .array(z.object({ deviceId: deviceNameSchema, ...deviceSettingsShape }))
    .max(MAX_BUILD_DEVICES)
    .default([])
    .describe('configure_device settings per device (SSIDs, DHCP / DNS server, ISP lines, name, x / y)'),
  cli: z
    .array(z.object({ deviceRef: deviceNameSchema, config: cliConfigSchema }))
    .max(MAX_BUILD_CLI)
    .default([])
    .describe('apply_cli_config per router / managed switch'),
  annotations: z.array(newAnnotationSchema).max(LAB_LIMITS.annotations).default([]).describe('edit_annotations add[] items: canvas notes and shapes'),
  description: labInfoShape.description,
  notes: labInfoShape.notes,
})

type BuildInput = z.infer<typeof buildInput>

function planOf(input: BuildInput): BuildPlan {
  const info = input.description === undefined && input.notes === undefined ? undefined : labInfoRequestOf({ description: input.description, notes: input.notes })
  return {
    devices: input.devices,
    links: input.links,
    hosts: input.hosts.map(({ deviceId, ...settings }) => ({ device: deviceId, ...settings })),
    settings: input.settings.map(({ deviceId, ...settings }) => deviceSettingsRequestOf(deviceId, settings)),
    cli: input.cli.map(({ deviceRef, config }) => ({ device: deviceRef, config })),
    annotations: input.annotations.map(newAnnotationOf),
    info,
  }
}

type BuildRun = BuildResult & { leases: LeaseOutcome[] }

export function registerBuildTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  const { builder, leases } = services

  /**
   * The build, then DHCP leases for every end device still waiting for one (after all config, so the
   * servers and routers are ready); a ToolError listing every failed step instead (nothing is saved then).
   */
  const run = (doc: LabDocument, plan: BuildPlan): BuildRun => {
    const result = builder.build(doc, plan)
    if (result.failures.length > 0) {
      throw ToolError.validation(
        `build_lab changed nothing: ${result.failures.length} step(s) failed. Fix them and send the whole build again.\n${builder.failureText(result.failures)}`,
        { failures: result.failures },
      )
    }
    const leased = leases.settle(result.doc)
    return { ...result, doc: leased.doc, leases: leased.outcomes }
  }
  const summary = (result: BuildRun): string => [builder.summary(result), leases.summary(result.leases)].filter((part) => part !== '').join(' ')
  const describe = (result: BuildRun): LiveEventDescription => ({
    summary: summary(result),
    deviceIds: [...new Set([...result.devices.map((device) => device.deviceId), ...result.configuredHosts, ...result.configuredDevices, ...result.leases.map((lease) => lease.deviceId)])],
    linkIds: result.linkIds,
  })

  server.registerTool(
    'build_lab',
    {
      title: 'Build lab',
      description:
        'Builds a whole network in ONE call (prefer this over many add_device / connect / configure_host / apply_cli_config calls): ' +
        'devices[] (each with your own ref), then links[] (a / b = refs), hosts[] (end-device IP settings), settings[] (configure_device: SSIDs, DHCP / DNS server, ISP lines), cli[] (IOS config per router / switch), ' +
        'annotations[] (canvas notes / shapes) and description / notes, applied in that order. Finally every end device on DHCP without an address asks for a lease (listed in the result). ' +
        `All-or-nothing: if any step fails nothing is saved and every failed step is listed with its index and reason. Without labId a new lab is created. Limits: ${MAX_BUILD_DEVICES} devices, ${MAX_BUILD_LINKS} links per call. ` +
        'The result has the live link; give it to the user once.',
      inputSchema: buildInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) =>
      responder.respond('build_lab', async () => {
        const plan = planOf(input)
        const steps = plan.devices.length + plan.links.length + plan.hosts.length + plan.settings.length + plan.cli.length + plan.annotations.length
        if (steps === 0 && plan.info === undefined) {
          throw ToolError.validation('build_lab needs at least one step in devices, links, hosts, settings, cli or annotations, or a description / notes.')
        }
        let labId = input.labId
        let result: BuildRun
        if (labId === undefined) {
          result = run(createEmptyLab(input.title ?? ''), plan)
          labId = await services.labs.create(result.doc, responder.event('build_lab', describe(result)))
        } else {
          result = await responder.withLab(labId, 'build_lab', (doc) => run(doc, plan), describe)
        }
        const devices = result.devices.map((device) => `${device.ref} → ${device.deviceId} "${device.name}" (${device.modelId})`)
        const text = [
          `${summary(result)} Lab ${labId}.`,
          ...(input.labId === undefined ? [services.liveLinks.sentence(labId)] : []),
          ...(devices.length === 0 ? [] : ['Devices:', ...devices.map((line) => `  ${line}`)]),
          ...(result.linkIds.length === 0 ? [] : [`Cables: ${result.linkIds.join(', ')}`]),
          ...(result.annotationIds.length === 0 ? [] : [`Annotations: ${result.annotationIds.join(', ')}`]),
          ...(result.leases.length === 0 ? [] : ['DHCP leases:', ...leases.lines(result.leases).map((line) => `  ${line}`)]),
        ].join('\n')
        return { text, labId, structured: { labId, devices: result.devices, linkIds: result.linkIds, annotationIds: result.annotationIds, leases: result.leases } }
      }),
  )
}
