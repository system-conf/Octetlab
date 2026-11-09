// add_device, remove_device, connect, disconnect, set_power: building the topology.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { OctetlabServices } from '../server/OctetlabServices'
import { coordinateSchema, deviceIdSchema, labIdSchema, nameSchema, portIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const cableSchema = z.enum(['auto', 'copperStraight', 'copperCross', 'fiber', 'serial', 'console', 'coaxial', 'wireless'])

export function registerTopologyTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  const { topology } = services

  server.registerTool(
    'add_device',
    {
      title: 'Add device',
      description: 'Adds a device of a catalog model (list_device_models) and returns its id and ports. Without x / y it is placed on a free grid cell.',
      inputSchema: z.object({
        labId: labIdSchema,
        modelId: z.string().min(1).max(64).describe('Catalog model id, e.g. "router2Port", "switch24", "pc"'),
        name: nameSchema.optional().describe('Display name; default like "Router 1"'),
        x: coordinateSchema.optional(),
        y: coordinateSchema.optional(),
      }),
      annotations: EDIT,
    },
    ({ labId, modelId, name, x, y }) =>
      responder.respond('add_device', async () => {
        const position = x === undefined || y === undefined ? undefined : { x, y }
        const { device } = await responder.withLab(labId, (doc) => topology.addDevice(doc, modelId, name, position))
        const ports = device.ports.map((port) => port.id)
        return { text: `Added ${device.id} "${device.name}" (${device.modelId}). Ports: ${ports.join(', ')}.`, structured: { deviceId: device.id, name: device.name, ports } }
      }),
  )

  server.registerTool(
    'remove_device',
    {
      title: 'Remove device',
      description: 'Removes a device and its cables.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema }),
      annotations: { ...EDIT, destructiveHint: true },
    },
    ({ labId, deviceId }) =>
      responder.respond('remove_device', async () => {
        const { removedLinks } = await responder.withLab(labId, (doc) => topology.removeDevice(doc, deviceId))
        return { text: `Removed ${deviceId}${removedLinks.length === 0 ? '' : ` and cables ${removedLinks.join(', ')}`}.`, structured: { deviceId, removedLinks } }
      }),
  )

  server.registerTool(
    'connect',
    {
      title: 'Connect devices',
      description:
        'Cables two devices. Without ports the first free compatible ports are used; cable "auto" picks the textbook cable (straight / crossover / fiber / serial). Wireless needs the SSID (default: the radio\'s first SSID).',
      inputSchema: z.object({
        labId: labIdSchema,
        deviceA: deviceIdSchema,
        deviceB: deviceIdSchema,
        portA: portIdSchema.optional().describe('Port of deviceA, e.g. "Gi0/0"'),
        portB: portIdSchema.optional().describe('Port of deviceB, e.g. "Fa0/1"'),
        cable: cableSchema.default('auto'),
        ssid: nameSchema.optional(),
      }),
      annotations: EDIT,
    },
    ({ labId, deviceA, deviceB, portA, portB, cable, ssid }) =>
      responder.respond('connect', async () => {
        const request = { deviceA, deviceB, cable, ...(portA === undefined ? {} : { portA }), ...(portB === undefined ? {} : { portB }), ...(ssid === undefined ? {} : { ssid }) }
        const { link } = await responder.withLab(labId, (doc) => topology.connect(doc, request))
        const text = `Connected ${link.a.deviceId} ${link.a.portId} ↔ ${link.b.deviceId} ${link.b.portId} with ${link.cable} (cable ${link.id}).`
        return { text, structured: { linkId: link.id, a: link.a, b: link.b, cable: link.cable } }
      }),
  )

  server.registerTool(
    'disconnect',
    {
      title: 'Disconnect cable',
      description: 'Removes a cable by its id (see get_lab).',
      inputSchema: z.object({ labId: labIdSchema, linkId: z.string().min(1).max(64) }),
      annotations: { ...EDIT, destructiveHint: true },
    },
    ({ labId, linkId }) =>
      responder.respond('disconnect', async () => {
        await responder.withLab(labId, (doc) => ({ doc: topology.disconnect(doc, linkId) }))
        return { text: `Removed cable ${linkId}.`, structured: { linkId } }
      }),
  )

  server.registerTool(
    'set_power',
    {
      title: 'Set power',
      description: 'Turns a device on or off.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, on: z.boolean() }),
      annotations: EDIT,
    },
    ({ labId, deviceId, on }) =>
      responder.respond('set_power', async () => {
        await responder.withLab(labId, (doc) => ({ doc: topology.setPower(doc, deviceId, on) }))
        return { text: `${deviceId} is ${on ? 'on' : 'off'}.`, structured: { deviceId, powered: on } }
      }),
  )
}
