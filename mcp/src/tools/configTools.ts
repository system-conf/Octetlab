// configure_host, apply_cli_config, run_command: configuring and testing devices.
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { HostAddressing } from '../lab/HostConfigurator'
import type { OctetlabServices } from '../server/OctetlabServices'
import { deviceIdSchema, ipv4Schema, labIdSchema, portIdSchema } from './toolSchemas'
import type { ToolResponder } from './ToolResponder'

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
/** Running-config lines returned by apply_cli_config (a 48-port switch config is longer; get the rest with run_command). */
const MAX_RUNNING_CONFIG_LINES = 200
/** Terminal lines returned by run_command. */
const MAX_OUTPUT_LINES = 300

function capped(lines: readonly string[], limit: number): string[] {
  return lines.length <= limit ? [...lines] : [...lines.slice(0, limit), `… (${lines.length - limit} more lines)`]
}

function addressingOf(input: { mode: 'dhcp' | 'static'; ip?: string | undefined; mask?: string | undefined }): HostAddressing {
  if (input.mode === 'dhcp') return { mode: 'dhcp' }
  if (input.ip === undefined || input.mask === undefined) throw ToolError.validation('Static mode needs both ip and mask.')
  return { mode: 'static', ip: input.ip, mask: input.mask }
}

export function registerConfigTools(server: McpServer, services: OctetlabServices, responder: ToolResponder): void {
  server.registerTool(
    'configure_host',
    {
      title: 'Configure host',
      description:
        'Sets an end device\'s network card: DHCP, or a static IP + mask, plus default gateway and DNS servers (absent = unchanged, "" clears the gateway). After switching to DHCP run "ipconfig /renew" with run_command.',
      inputSchema: z.object({
        labId: labIdSchema,
        deviceId: deviceIdSchema,
        portId: portIdSchema.optional().describe('Network card, default the first one (eth0)'),
        mode: z.enum(['dhcp', 'static']),
        ip: ipv4Schema.optional().describe('Static mode: address'),
        mask: ipv4Schema.optional().describe('Static mode: mask, e.g. 255.255.255.0'),
        gateway: ipv4Schema.or(z.literal('')).optional(),
        dnsServers: z.array(ipv4Schema).max(LAB_LIMITS.listItems).optional(),
      }),
      annotations: EDIT,
    },
    (input) =>
      responder.respond('configure_host', async () => {
        const addressing = addressingOf(input)
        const request = {
          deviceId: input.deviceId,
          addressing,
          ...(input.portId === undefined ? {} : { portId: input.portId }),
          ...(input.gateway === undefined ? {} : { gateway: input.gateway }),
          ...(input.dnsServers === undefined ? {} : { dnsServers: input.dnsServers }),
        }
        const { device, portId } = await responder.withLab(input.labId, (doc) => services.hosts.configure(doc, request))
        const address = addressing.mode === 'dhcp' ? 'DHCP' : `${addressing.ip} ${addressing.mask}`
        const text = `${device.id} ${portId}: ${address}; gateway ${device.host?.defaultGateway || '(none)'}; DNS ${device.host?.dnsServers.join(', ') || '(none)'}.`
        return { text, structured: { deviceId: device.id, portId, addressing, gateway: device.host?.defaultGateway ?? '', dnsServers: device.host?.dnsServers ?? [] } }
      }),
  )

  server.registerTool(
    'apply_cli_config',
    {
      title: 'Apply IOS config',
      description:
        'Types IOS configuration lines into a router / managed switch console (configure terminal is entered automatically; "enable" / "conf t" / "end" / "write memory" lines also work). Returns rejected lines with their errors and the resulting running-config.',
      inputSchema: z.object({
        labId: labIdSchema,
        deviceId: deviceIdSchema,
        config: z.string().min(1).max(50_000).describe('Config lines separated by newlines, e.g. "interface Gi0/0\\n ip address 192.168.1.1 255.255.255.0\\n no shutdown"'),
      }),
      annotations: EDIT,
    },
    ({ labId, deviceId, config }) =>
      responder.respond('apply_cli_config', async () => {
        const result = await responder.withLab(labId, (doc) => services.cliConfig.apply(doc, deviceId, config))
        const errorText = result.errors.map((error) => `  ${error.line.trim()} → ${error.error}`)
        const runningConfig = capped(result.runningConfig, MAX_RUNNING_CONFIG_LINES)
        const text = [
          result.errors.length === 0 ? `All lines accepted on ${deviceId}.` : `${result.errors.length} line(s) rejected on ${deviceId}:`,
          ...errorText,
          ...(result.notes.length === 0 ? [] : ['Console messages:', ...result.notes.map((note) => `  ${note}`)]),
          'running-config:',
          ...runningConfig,
        ].join('\n')
        return { text, structured: { deviceId, errors: result.errors, notes: result.notes, runningConfig } }
      }),
  )

  server.registerTool(
    'run_command',
    {
      title: 'Run command',
      description:
        'Runs one command on a device through the packet simulator and returns the terminal output. PCs / laptops / servers: ping, tracert, ipconfig [/all|/renew|/release], nslookup, arp -a, netstat, hostname. Routers / managed switches (privileged EXEC): show …, ping, traceroute, write memory. DHCP results are saved to the lab. ARP / MAC tables start empty in every call.',
      inputSchema: z.object({ labId: labIdSchema, deviceId: deviceIdSchema, command: z.string().trim().min(1).max(LAB_LIMITS.nameLength) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ labId, deviceId, command }) =>
      responder.respond('run_command', async () => {
        const output = await responder.withLab(labId, (doc) => services.commands.run(doc, deviceId, command))
        const lines = capped(output.lines, MAX_OUTPUT_LINES)
        const notes = [
          ...(output.changed ? ['(The lab was updated.)'] : []),
          ...(output.settleTruncated ? ['(The simulated network had not fully settled; results may be incomplete.)'] : []),
        ]
        return { text: [...lines, ...notes].join('\n'), structured: { deviceId, command, lines, labChanged: output.changed } }
      }),
  )
}
