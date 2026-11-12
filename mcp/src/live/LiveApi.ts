// The live-lab HTTP API of the MCP Worker (docs/LIVE_LABS.md §6):
//   GET /live/<labId>         → 200 { labId, version, doc, events } | 404
//   GET /live/<labId>/socket  → WebSocket upgrade handed to the lab's room
// Only the app's origins (APP_ORIGINS) may call it (403 otherwise); requests count against the same
// per-IP rate limit as /mcp.
import { LAB_ID_PATTERN } from '../store/LabStore'
import type { LabRooms } from './LabRooms'
import type { OriginPolicy } from './OriginPolicy'

export const LIVE_PREFIX = '/live/'

const ROUTE = /^\/live\/([^/]+)(\/socket)?$/

/** What LiveApi needs from the rate limiter (RateLimitGuard). */
export interface RequestLimiter {
  allows(request: Request): Promise<boolean>
}

export interface LiveApiDeps {
  rooms: LabRooms
  origins: OriginPolicy
  limiter: RequestLimiter
}

type ErrorCode = 'notFound' | 'forbidden' | 'methodNotAllowed' | 'tooManyRequests' | 'upgradeRequired'

export class LiveApi {
  private readonly deps: LiveApiDeps

  constructor(deps: LiveApiDeps) {
    this.deps = deps
  }

  static handles(url: URL): boolean {
    return url.pathname.startsWith(LIVE_PREFIX)
  }

  async handle(request: Request): Promise<Response> {
    const origin = this.deps.origins.allowed(request)
    const route = ROUTE.exec(new URL(request.url).pathname)
    const labId = route?.[1]
    if (origin === null) return this.error(null, 403, 'forbidden', 'This page may not read Octetlab live labs.')
    if (route === null || labId === undefined || !LAB_ID_PATTERN.test(labId)) return this.error(origin, 404, 'notFound', 'There is no live lab at this address.')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: this.corsHeaders(origin) })
    if (request.method !== 'GET') return this.error(origin, 405, 'methodNotAllowed', 'Only GET is supported here.', { Allow: 'GET, OPTIONS' })
    if (!(await this.deps.limiter.allows(request))) {
      return this.error(origin, 429, 'tooManyRequests', 'Too many requests from this address. Wait a minute and try again.', { 'Retry-After': '60' })
    }
    return route[2] === undefined ? this.snapshot(origin, labId) : this.socket(origin, labId, request)
  }

  private async snapshot(origin: string, labId: string): Promise<Response> {
    const snapshot = await this.deps.rooms.room(labId).snapshot()
    if (snapshot === null) return this.error(origin, 404, 'notFound', 'This live lab does not exist or has ended (labs are kept 7 days after their last change).')
    return Response.json(
      { labId, version: snapshot.version, doc: snapshot.docText, events: snapshot.events },
      { headers: { ...this.corsHeaders(origin), 'Cache-Control': 'no-store' } },
    )
  }

  private socket(origin: string, labId: string, request: Request): Promise<Response> | Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return this.error(origin, 426, 'upgradeRequired', 'This address only accepts WebSocket connections.', { Upgrade: 'websocket' })
    }
    return this.deps.rooms.connect(labId, request)
  }

  private corsHeaders(origin: string): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
  }

  private error(origin: string | null, status: number, error: ErrorCode, message: string, extra: Record<string, string> = {}): Response {
    const headers = { ...(origin === null ? { Vary: 'Origin' } : this.corsHeaders(origin)), 'Cache-Control': 'no-store', ...extra }
    return Response.json({ error, message }, { status, headers })
  }
}
