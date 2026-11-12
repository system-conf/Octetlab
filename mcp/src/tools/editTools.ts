// update_lab_info, edit_annotations, configure_device, set_cable_connected: what the app's GUI edits
// besides cabling, host addressing and IOS config (title / description / notes, canvas annotations,
// device name / position / SSIDs / DHCP / DNS server / ISP outage, unplugging a cable).
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { LabDocument } from '../../../src/domain'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { OctetlabServices } from '../server/OctetlabServices'
import {
  annotationChangeSchema,
  annotationFieldsOf,
  deviceSettingsRequestOf,
  deviceSettingsShape,
  isEmptyDeviceSettings,
  labInfoRequestOf,
  labInfoShape,
  newAnnotationOf,
  newAnnotationSchema,
} from './editSchemas'
import { deviceIdSchema, labIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

function nameOf(doc: LabDocument, deviceId: string): string {
  return doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
}

function listed(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`
}

export function registerEditTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  server.registerTool(
    'update_lab_info',
    {
      title: 'Update lab info',
      description:
        "Sets the lab's title and description, and its notebook: notes replaces the notes, appendNotes adds text at the end (use it for step-by-step explanations the user can read in the app). get_lab shows the current values.",
      inputSchema: z.object({ labId: labIdSchema, ...labInfoShape }),
      annotations: EDIT,
    },
    (input) =>
      responder.respond('update_lab_info', async () => {
        const result = await responder.withLab(
          input.labId,
          'update_lab_info',
          (doc) => services.labInfo.update(doc, labInfoRequestOf(input)),
          (updated) => ({ summary: `Updated the lab's ${listed(updated.changes)}.`, deviceIds: [], linkIds: [] }),
        )
        const text = `Updated the lab's ${listed(result.changes)}. Title "${result.doc.meta.title}"; notes ${result.doc.notes.length} characters.`
        return { text, labId: input.labId, structured: { changes: result.changes, title: result.doc.meta.title, description: result.doc.meta.description ?? '', notesLength: result.doc.notes.length } }
      }),
  )

  server.registerTool(
    'edit_annotations',
    {
      title: 'Edit annotations',
      description:
        'Draws on the lab canvas: text notes, rectangles / ellipses (e.g. to group "Kitchen" devices; drawn behind devices) and lines. add[] creates (ids are returned), update[] changes fields of existing ones (ids from get_lab), remove[] deletes by id. ' +
        'text needs at + text; rectangle / ellipse need at + width + height (optional label, filled); line needs from + to (optional arrow). Canvas units: devices are about 80 wide; get_lab shows device positions.',
      inputSchema: z.object({
        labId: labIdSchema,
        add: z.array(newAnnotationSchema).max(LAB_LIMITS.annotations).default([]),
        update: z.array(annotationChangeSchema).max(LAB_LIMITS.annotations).default([]),
        remove: z.array(z.string().min(1).max(LAB_LIMITS.idLength)).max(LAB_LIMITS.annotations).default([]),
      }),
      annotations: EDIT,
    },
    ({ labId, add, update, remove }) =>
      responder.respond('edit_annotations', async () => {
        const edits = { add: add.map(newAnnotationOf), update: update.map((change) => ({ id: change.id, ...annotationFieldsOf(change) })), remove }
        const result = await responder.withLab(
          labId,
          'edit_annotations',
          (doc) => services.annotations.edit(doc, edits),
          (edited) => {
            const parts = [
              ...(edited.added.length === 0 ? [] : [`added ${edited.added.length}`]),
              ...(edited.updated.length === 0 ? [] : [`changed ${edited.updated.length}`]),
              ...(edited.removed.length === 0 ? [] : [`removed ${edited.removed.length}`]),
            ]
            const sentence = listed(parts)
            return { summary: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} annotation${edited.added.length + edited.updated.length + edited.removed.length === 1 ? '' : 's'}.`, deviceIds: [], linkIds: [] }
          },
        )
        const text = [
          ...(result.added.length === 0 ? [] : [`Added ${result.added.join(', ')}.`]),
          ...(result.updated.length === 0 ? [] : [`Changed ${result.updated.join(', ')}.`]),
          ...(result.removed.length === 0 ? [] : [`Removed ${result.removed.join(', ')}.`]),
        ].join(' ')
        return { text, labId, structured: { added: result.added, updated: result.updated, removed: result.removed } }
      }),
  )

  server.registerTool(
    'configure_device',
    {
      title: 'Configure device',
      description:
        "Changes a device the way its settings window in the app does (absent fields stay unchanged): name; x / y canvas position; ssids (access point / wireless router: replaces the SSID list); " +
        'dhcp (DHCP server on a router / server / wireless router: enabled, pools, excludedRanges); dns (DNS server: enabled, forwarders, A records); ' +
        'internetService (internet cloud: set a line up / down to simulate an ISP outage). Lists replace the whole list, like the app\'s forms; get_lab shows the current settings. ' +
        'After a DHCP server change, end devices still without a lease ask for one. Router interfaces and VLANs are configured with apply_cli_config, end-device addresses with configure_host.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, ...deviceSettingsShape }),
      annotations: EDIT,
    },
    ({ labId, deviceId, ...settings }) =>
      responder.respond('configure_device', async () => {
        const request = deviceSettingsRequestOf(deviceId, settings)
        if (isEmptyDeviceSettings(request)) throw ToolError.validation('Give at least one setting to change (name, x / y, ssids, dhcp, dns or internetService).')
        const result = await responder.withLab(
          labId,
          'configure_device',
          (doc) => {
            const configured = services.deviceSettings.configure(doc, request)
            const leased = request.dhcp === undefined ? { doc: configured.doc, outcomes: [] } : services.leases.settle(configured.doc)
            return { ...configured, doc: leased.doc, leases: leased.outcomes }
          },
          (configured) => ({
            summary: [`Changed the ${listed(configured.changes)} of ${configured.device.name}.`, services.leases.summary(configured.leases)].filter((part) => part !== '').join(' '),
            deviceIds: [configured.device.id, ...new Set(configured.leases.map((lease) => lease.deviceId))],
            linkIds: [],
          }),
        )
        const view = services.summary.view(result.doc).devices.find((device) => device.id === deviceId)
        const text = [`Changed the ${listed(result.changes)} of ${deviceId} "${result.device.name}".`, ...services.leases.lines(result.leases)].join('\n')
        return { text, labId, structured: { deviceId, changes: result.changes, name: result.device.name, settings: view?.settings ?? {}, position: view?.position, leases: result.leases } }
      }),
  )

  server.registerTool(
    'set_cable_connected',
    {
      title: 'Plug / unplug cable',
      description:
        'Unplugs a cable (connected false: it stays on the canvas and keeps its ports, like a pulled plug — good for simulating a fault) or plugs it back in. To delete a cable use disconnect.',
      inputSchema: z.object({ labId: labIdSchema, linkId: z.string().min(1).max(LAB_LIMITS.idLength), connected: z.boolean() }),
      annotations: EDIT,
    },
    ({ labId, linkId, connected }) =>
      responder.respond('set_cable_connected', async () => {
        const { link } = await responder.withLab(
          labId,
          'set_cable_connected',
          (doc) => services.topology.setCableConnected(doc, linkId, connected),
          (result) => ({
            summary: `${connected ? 'Plugged in' : 'Unplugged'} the cable between ${nameOf(result.doc, result.link.a.deviceId)} and ${nameOf(result.doc, result.link.b.deviceId)}.`,
            deviceIds: [result.link.a.deviceId, result.link.b.deviceId],
            linkIds: [linkId],
          }),
        )
        const text = `Cable ${linkId} (${link.a.deviceId} ${link.a.portId} ↔ ${link.b.deviceId} ${link.b.portId}) is ${connected ? 'plugged in' : 'unplugged'}.${connected ? ' End devices on DHCP may need renew_dhcp.' : ''}`
        return { text, labId, structured: { linkId, connected } }
      }),
  )
}
