// configure_host, apply_cli_config, run_command: configuring and testing devices.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { hostSettingsRequestOf } from '../lab/HostConfigurator'
import { eventOutput } from '../live/LiveEvent'
import type { OctetlabServices } from '../server/OctetlabServices'
import { cliConfigSchema, deviceIdSchema, hostSettingsShape, labIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
/** Running-config lines returned by apply_cli_config (a 48-port switch config is longer; get the rest with run_command). */
const MAX_RUNNING_CONFIG_LINES = 200
/** Terminal lines returned by run_command. */
const MAX_OUTPUT_LINES = 300

function capped(lines: readonly string[], limit: number): string[] {
  return lines.length <= limit ? [...lines] : [...lines.slice(0, limit), `… (${lines.length - limit} more lines)`]
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function registerConfigTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  server.registerTool(
    'configure_host',
    {
      title: 'Configure host',
      description:
        'Sets an end device\'s network card: DHCP, or a static IP + mask, plus default gateway and DNS servers (absent = unchanged, "" clears the gateway). After switching to DHCP run "ipconfig /renew" with run_command. To set up many hosts at once while building, use build_lab.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, ...hostSettingsShape }),
      annotations: EDIT,
    },
    (input) =>
      responder.respond('configure_host', async () => {
        const request = hostSettingsRequestOf(input.deviceId, input)
        const { addressing } = request
        const address = addressing.mode === 'dhcp' ? 'DHCP' : `${addressing.ip} ${addressing.mask}`
        const { device, portId } = await responder.withLab(
          input.labId,
          'configure_host',
          (doc) => services.hosts.configure(doc, request),
          (result) => ({ summary: `Configured ${result.device.name} ${result.portId}: ${address}.`, deviceIds: [result.device.id], linkIds: [] }),
        )
        const text = `${device.id} ${portId}: ${address}; gateway ${device.host?.defaultGateway || '(none)'}; DNS ${device.host?.dnsServers.join(', ') || '(none)'}.`
        return {
          text,
          labId: input.labId,
          structured: { deviceId: device.id, portId, addressing, gateway: device.host?.defaultGateway ?? '', dnsServers: device.host?.dnsServers ?? [] },
        }
      }),
  )

  server.registerTool(
    'apply_cli_config',
    {
      title: 'Apply IOS config',
      description:
        'Types IOS configuration lines into a router / managed switch console (configure terminal is entered automatically; "enable" / "conf t" / "end" / "write memory" lines also work). Returns rejected lines with their errors and the resulting running-config.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, config: cliConfigSchema }),
      annotations: EDIT,
    },
    ({ labId, deviceId, config }) =>
      responder.respond('apply_cli_config', async () => {
        const result = await responder.withLab(
          labId,
          'apply_cli_config',
          (doc) => services.cliConfig.apply(doc, deviceId, config),
          (applied) => {
            const lines = config.split('\n').filter((line) => line.trim() !== '').length
            const rejected = applied.errors.length === 0 ? '' : `, ${applied.errors.length} rejected`
            return { summary: `Configured ${applied.device.name} (${plural(lines, 'line')}${rejected}).`, deviceIds: [applied.device.id], linkIds: [] }
          },
        )
        const errorText = result.errors.map((error) => `  ${error.line.trim()} → ${error.error}`)
        const runningConfig = capped(result.runningConfig, MAX_RUNNING_CONFIG_LINES)
        const text = [
          result.errors.length === 0 ? `All lines accepted on ${deviceId}.` : `${result.errors.length} line(s) rejected on ${deviceId}:`,
          ...errorText,
          ...(result.notes.length === 0 ? [] : ['Console messages:', ...result.notes.map((note) => `  ${note}`)]),
          'running-config:',
          ...runningConfig,
        ].join('\n')
        return { text, labId, structured: { deviceId, errors: result.errors, notes: result.notes, runningConfig } }
      }),
  )

  server.registerTool(
    'run_command',
    {
      title: 'Run command',
      description:
        'Runs one command on a device through the packet simulator and returns the terminal output (also shown in the live view). PCs / laptops / servers: ping, tracert, ipconfig [/all|/renew|/release], nslookup, arp -a, netstat, hostname. Routers / managed switches (privileged EXEC): show …, ping, traceroute, write memory. DHCP results are saved to the lab. ARP / MAC tables start empty in every call.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, command: z.string().trim().min(1).max(LAB_LIMITS.nameLength) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ labId, deviceId, command }) =>
      responder.respond('run_command', async () => {
        const output = await responder.withLab(
          labId,
          'run_command',
          (doc) => services.commands.run(doc, deviceId, command),
          (result) => {
            const name = result.doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
            return { summary: `Ran "${command}" on ${name}.`, deviceIds: [deviceId], linkIds: [], output: eventOutput(deviceId, command, result.lines) }
          },
        )
        const lines = capped(output.lines, MAX_OUTPUT_LINES)
        const notes = [
          ...(output.changed ? ['(The lab was updated.)'] : []),
          ...(output.settleTruncated ? ['(The simulated network had not fully settled; results may be incomplete.)'] : []),
        ]
        return { text: [...lines, ...notes].join('\n'), labId, structured: { deviceId, command, lines, labChanged: output.changed } }
      }),
  )
}
