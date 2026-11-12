// Per-client-IP request limit in front of /mcp (Workers rate-limit binding). No auth in v1, so this is
// the abuse control together with the input limits of the tools.
import type { RateLimitBinding } from './WorkerBindings'

export class RateLimitGuard {
  private readonly limiter: RateLimitBinding

  constructor(limiter: RateLimitBinding) {
    this.limiter = limiter
  }

  /** Whether the caller (by client IP) is still under the limit; counts this request. */
  async allows(request: Request): Promise<boolean> {
    const key = request.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await this.limiter.limit({ key })
    return success
  }

  /** A 429 JSON-RPC error response when the caller is over the limit, else null. */
  async check(request: Request): Promise<Response | null> {
    if (await this.allows(request)) return null
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests: the Octetlab MCP server allows 60 requests per minute. Wait a minute and try again.' }, id: null },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }
}
