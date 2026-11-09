// Octetlab MCP server Worker (docs/MCP_SERVER.md): Streamable HTTP at /mcp through the Agents SDK's
// stateless handler; labs persist in Workers KV between tool calls.
import { createMcpHandler } from 'agents/mcp/server'
import { RateLimitGuard } from './platform/RateLimitGuard'
import type { WorkerEnv } from './platform/WorkerBindings'
import { createOctetlabServer } from './server/createOctetlabServer'
import { CloudflareKvStore } from './store/CloudflareKvStore'

const MCP_ROUTE = '/mcp'

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== MCP_ROUTE) {
      return new Response(`Octetlab MCP server. Add ${url.origin}${MCP_ROUTE} as a custom MCP connector.\n`, {
        status: url.pathname === '/' ? 200 : 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    const limited = await new RateLimitGuard(env.MCP_RATE_LIMITER).check(request)
    if (limited !== null) return limited
    const store = new CloudflareKvStore(env.LABS)
    const handler = createMcpHandler(() => createOctetlabServer({ store, appLabUrl: env.APP_LAB_URL }), {
      route: MCP_ROUTE,
      onerror: (error) => console.error('MCP handler error', error),
    })
    return handler.fetch(request)
  },
}
