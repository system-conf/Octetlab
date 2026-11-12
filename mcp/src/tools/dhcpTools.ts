// renew_dhcp: end devices ask their DHCP server for a lease (the `ipconfig /renew` exchange), also
// devices without a terminal (cameras, phones, printers…).
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { MAX_MCP_DEVICES } from '../lab/LabTopology'
import { ToolError } from '../errors/ToolError'
import type { OctetlabServices } from '../server/OctetlabServices'
import { deviceIdSchema, labIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

export function registerDhcpTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  const { leases } = services

  server.registerTool(
    'renew_dhcp',
    {
      title: 'Renew DHCP leases',
      description:
        'End devices on DHCP ask for an address again (like "ipconfig /renew", for any end device incl. cameras, phones, printers), one after the other on the simulated network. ' +
        'deviceIds absent = every powered end device in DHCP mode. Use it after cabling, power or server changes; the result lists each lease or why there was none. Router interfaces are not DHCP clients.',
      inputSchema: z.object({ labId: labIdSchema, deviceIds: z.array(deviceIdSchema).min(1).max(MAX_MCP_DEVICES).optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ labId, deviceIds }) =>
      responder.respond('renew_dhcp', async () => {
        const result = await responder.withLab(
          labId,
          'renew_dhcp',
          (doc) => {
            const targets = deviceIds === undefined ? doc.state.devices.filter((device) => leases.isClient(device)).map((device) => device.id) : [...new Set(deviceIds)]
            for (const id of targets) {
              const device = services.devices.require(doc, id)
              if (!leases.isClient(device)) {
                throw ToolError.validation(`${device.id} (${device.modelId}) is not a DHCP client: it must be a powered-on end device with a network card in DHCP mode (configure_host mode "dhcp").`)
              }
            }
            if (targets.length === 0) throw ToolError.validation('No end device in this lab is on DHCP (configure_host mode "dhcp" switches one).')
            return leases.obtain(doc, targets)
          },
          (run) => ({ summary: leases.summary(run.outcomes), deviceIds: [...new Set(run.outcomes.map((outcome) => outcome.deviceId))], linkIds: [] }),
        )
        return { text: [leases.summary(result.outcomes), ...leases.lines(result.outcomes)].join('\n'), labId, structured: { leases: result.outcomes } }
      }),
  )
}
