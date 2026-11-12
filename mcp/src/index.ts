// Octetlab MCP server Worker (docs/MCP_SERVER.md): Streamable HTTP at /mcp through the Agents SDK's
// stateless handler; each lab lives in a LabRoom Durable Object, which also serves the live view at
// /live/<labId> (docs/LIVE_LABS.md).
import { createMcpHandler } from 'agents/mcp/server'
import { DurableLabRooms } from './live/DurableLabRooms'
import { LiveApi } from './live/LiveApi'
import { OriginPolicy } from './live/OriginPolicy'
import { RateLimitGuard } from './platform/RateLimitGuard'
import type { WorkerEnv } from './platform/WorkerBindings'
import { createOctetlabServer } from './server/createOctetlabServer'
import { CloudflareKvStore } from './store/CloudflareKvStore'

export { LabRoom } from './live/LabRoom'

const MCP_ROUTE = '/mcp'

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const rooms = new DurableLabRooms(env.LAB_ROOMS)
    const limiter = new RateLimitGuard(env.MCP_RATE_LIMITER)
    if (LiveApi.handles(url)) {
      return new LiveApi({ rooms, origins: new OriginPolicy(env.APP_ORIGINS), limiter }).handle(request)
    }
    if (url.pathname !== MCP_ROUTE) {
      return new Response(`Octetlab MCP server. Add ${url.origin}${MCP_ROUTE} as a custom MCP connector.\n`, {
        status: url.pathname === '/' ? 200 : 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    const limited = await limiter.check(request)
    if (limited !== null) return limited
    const legacyStore = new CloudflareKvStore(env.LABS)
    const handler = createMcpHandler(() => createOctetlabServer({ rooms, legacyStore, appLabUrl: env.APP_LAB_URL, appOrigin: env.APP_ORIGIN }), {
      route: MCP_ROUTE,
      onerror: (error) => console.error('MCP handler error', error),
    })
    return handler.fetch(request)
  },
}
