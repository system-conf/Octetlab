// Live labs (docs/LIVE_LABS.md): watching a lab an assistant builds through the MCP server.
export { DEFAULT_LIVE_API_ORIGIN, LiveLabEndpoints } from './LiveLabEndpoints'
export { LiveLabProtocol, MAX_OUTPUT_LINES, type LiveCommandOutput, type LiveEvent, type LiveServerMessage } from './LiveLabProtocol'
export {
  browserClock,
  browserLiveDeps,
  FIRST_RETRY_MS,
  LiveLabConnection,
  MAX_RETRY_MS,
  PING_INTERVAL_MS,
  type LiveClock,
  type LiveFetch,
  type LiveHttpResponse,
  type LiveLabConnectionDeps,
  type LiveLabSignal,
  type LiveLabStatus,
  type LiveSocket,
  type LiveSocketFactory,
  type LiveSocketHandlers,
} from './LiveLabConnection'
