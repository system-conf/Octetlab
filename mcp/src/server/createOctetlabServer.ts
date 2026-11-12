// The MCP server of one request: Octetlab's tools on fresh services (stateless pattern; labs live in
// one LabRoom Durable Object each).
import { McpServer } from '@modelcontextprotocol/server'
import { registerBuildTools } from '../tools/buildTools'
import { registerCatalogTools } from '../tools/catalogTools'
import { registerConfigTools } from '../tools/configTools'
import { registerDhcpTools } from '../tools/dhcpTools'
import { registerEditTools } from '../tools/editTools'
import { registerLabTools } from '../tools/labTools'
import { registerTopologyTools } from '../tools/topologyTools'
import { ToolResponder } from '../tools/ToolResponder'
import { OctetlabServices, type OctetlabServicesConfig } from './OctetlabServices'

export const SERVER_INFO = { name: 'octetlab', version: '1.0.0' } as const

const INSTRUCTIONS =
  'Octetlab builds and simulates small computer networks. Typical flow: build_lab (one call: devices, cables, host IP settings ' +
  'and router / switch config; or create_lab / open_sample first), then run_command (ping, tracert, show …) to test, and small ' +
  'edits with add_device, connect, configure_host, configure_device (name, position, SSIDs, DHCP / DNS server, ISP outage) or ' +
  'apply_cli_config. update_lab_info sets title / description / notes; edit_annotations draws notes and shapes on the canvas; ' +
  'set_cable_connected and configure_device internetService simulate faults; renew_dhcp asks for DHCP leases again. Every new lab ' +
  'has a live link (liveUrl): give it to the user once — the lab redraws in their browser as you work. share_link gives a frozen ' +
  'copy instead. Router interfaces start shut down: include "no shutdown".'

export function createOctetlabServer(config: OctetlabServicesConfig): McpServer {
  const services = new OctetlabServices(config)
  const responder = new ToolResponder(services.labs, services.liveLinks, config.now)
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  registerCatalogTools(server, services, responder)
  registerLabTools(server, services, responder)
  registerBuildTools(server, services, responder)
  registerTopologyTools(server, services, responder)
  registerConfigTools(server, services, responder)
  registerDhcpTools(server, services, responder)
  registerEditTools(server, services, responder)
  return server
}
