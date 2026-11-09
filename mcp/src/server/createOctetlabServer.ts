// The MCP server of one request: Octetlab's tools on fresh services (stateless pattern; labs live in KV).
import { McpServer } from '@modelcontextprotocol/server'
import { registerCatalogTools } from '../tools/catalogTools'
import { registerConfigTools } from '../tools/configTools'
import { registerLabTools } from '../tools/labTools'
import { registerTopologyTools } from '../tools/topologyTools'
import { ToolResponder } from '../tools/ToolResponder'
import { OctetlabServices, type OctetlabServicesConfig } from './OctetlabServices'

export const SERVER_INFO = { name: 'octetlab', version: '1.0.0' } as const

const INSTRUCTIONS =
  'Octetlab builds and simulates small computer networks. Typical flow: create_lab (or open_sample), add_device, connect, ' +
  'configure_host for PCs and apply_cli_config for routers / switches, run_command (ping, tracert, show …) to test, ' +
  'then share_link to open the lab in the Octetlab web app. Router interfaces start shut down: include "no shutdown".'

export function createOctetlabServer(config: OctetlabServicesConfig): McpServer {
  const services = new OctetlabServices(config)
  const responder = new ToolResponder(services.labs)
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  registerCatalogTools(server, services, responder)
  registerLabTools(server, services, responder)
  registerTopologyTools(server, services, responder)
  registerConfigTools(server, services, responder)
  return server
}
