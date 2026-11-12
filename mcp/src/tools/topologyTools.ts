// add_device, remove_device, connect, disconnect, set_power: small edits of the topology (build_lab
// builds many devices and cables in one call).
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { LabDocument } from '../../../src/domain'
import type { OctetlabServices } from '../server/OctetlabServices'
import { cableSchema, coordinateSchema, deviceIdSchema, labIdSchema, nameSchema, portIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

function nameOf(doc: LabDocument, deviceId: string): string {
  return doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
}

export function registerTopologyTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  const { topology } = services

  server.registerTool(
    'add_device',
    {
      title: 'Add device',
      description:
        'Adds one device of a catalog model (list_device_models) and returns its id and ports. Without x / y it is placed on a free grid cell. For building a whole network use build_lab (one call); use add_device for small edits.',
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
        const { device } = await responder.withLab(
          labId,
          'add_device',
          (doc) => topology.addDevice(doc, modelId, name, position),
          (added) => ({ summary: `Added ${added.device.name} (${added.device.modelId}).`, deviceIds: [added.device.id], linkIds: [] }),
        )
        const ports = device.ports.map((port) => port.id)
        return { text: `Added ${device.id} "${device.name}" (${device.modelId}). Ports: ${ports.join(', ')}.`, labId, structured: { deviceId: device.id, name: device.name, ports } }
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
        const { removedLinks } = await responder.withLab(
          labId,
          'remove_device',
          (doc) => ({ ...topology.removeDevice(doc, deviceId), name: nameOf(doc, deviceId) }),
          (removed) => {
            const count = removed.removedLinks.length
            const cables = count === 0 ? '' : ` and its ${count === 1 ? 'cable' : `${count} cables`}`
            return { summary: `Removed ${removed.name}${cables}.`, deviceIds: [], linkIds: [] }
          },
        )
        return { text: `Removed ${deviceId}${removedLinks.length === 0 ? '' : ` and cables ${removedLinks.join(', ')}`}.`, labId, structured: { deviceId, removedLinks } }
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
        const { link } = await responder.withLab(
          labId,
          'connect',
          (doc) => topology.connect(doc, request),
          (connected) => ({
            summary: `Connected ${nameOf(connected.doc, connected.link.a.deviceId)} ${connected.link.a.portId} to ${nameOf(connected.doc, connected.link.b.deviceId)} ${connected.link.b.portId}.`,
            deviceIds: [connected.link.a.deviceId, connected.link.b.deviceId],
            linkIds: [connected.link.id],
          }),
        )
        const text = `Connected ${link.a.deviceId} ${link.a.portId} ↔ ${link.b.deviceId} ${link.b.portId} with ${link.cable} (cable ${link.id}).`
        return { text, labId, structured: { linkId: link.id, a: link.a, b: link.b, cable: link.cable } }
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
        await responder.withLab(
          labId,
          'disconnect',
          (doc) => {
            const link = doc.state.links.find((candidate) => candidate.id === linkId)
            const ends = link === undefined ? [] : [link.a.deviceId, link.b.deviceId]
            return { doc: topology.disconnect(doc, linkId), ends }
          },
          (result) => ({ summary: `Removed the cable between ${result.ends.map((id) => nameOf(result.doc, id)).join(' and ')}.`, deviceIds: result.ends, linkIds: [] }),
        )
        return { text: `Removed cable ${linkId}.`, labId, structured: { linkId } }
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
        await responder.withLab(
          labId,
          'set_power',
          (doc) => ({ doc: topology.setPower(doc, deviceId, on) }),
          (result) => ({ summary: `Turned ${nameOf(result.doc, deviceId)} ${on ? 'on' : 'off'}.`, deviceIds: [deviceId], linkIds: [] }),
        )
        return { text: `${deviceId} is ${on ? 'on' : 'off'}.`, labId, structured: { deviceId, powered: on } }
      }),
  )
}
