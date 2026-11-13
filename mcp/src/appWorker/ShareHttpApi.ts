// The share API on the app origin (docs/SHARE_PAGES.md §5):
//   POST   /api/shares          → 201 { id, created: true, deleteToken } | 200 { id, created: false, deleteToken: null }
//   GET    /api/shares/<id>     → 200 ShareRecord | 404
//   DELETE /api/shares/<id>     → 204 (Authorization: Bearer <deleteToken>) | 403 | 404
//   GET    /p/<id>/og.png       → the rendered topology, or a redirect to the app's default image
// Writes need the app's Origin and count against a per-IP rate limit; validation of the body happens
// in the share store (zod + lab serializer), which has the CPU budget for it.
import { SHARE_API_PATH, SHARE_ID_PATTERN, SHARE_LIMITS, type ShareErrorCode } from '../../../src/features/share/model/shareLimits'
import type { OriginPolicy } from '../live/OriginPolicy'
import type { RequestLimiter } from '../live/LiveApi'
import type { ShareStoreStub } from './AppWorkerEnv'

const RECORD_ROUTE = new RegExp(`^${SHARE_API_PATH}/([^/]+)$`)
const IMAGE_ROUTE = /^\/p\/([^/]+)\/og\.png$/

const STATUS: Readonly<Record<ShareErrorCode, number>> = {
  invalidRequest: 400,
  invalidLab: 422,
  tooLarge: 413,
  notFound: 404,
  forbidden: 403,
  tooManyRequests: 429,
  unavailable: 503,
}

const MESSAGES: Readonly<Record<ShareErrorCode, string>> = {
  invalidRequest: 'The request is not valid.',
  invalidLab: 'The lab is not valid.',
  tooLarge: 'The lab is too large for a share page.',
  notFound: 'There is no share page at this address.',
  forbidden: 'This request is not allowed.',
  tooManyRequests: 'Too many requests from this address. Wait a minute and try again.',
  unavailable: 'The share service is not available right now.',
}

export interface ShareHttpApiDeps {
  store: () => ShareStoreStub
  origins: OriginPolicy
  limiter: RequestLimiter
}

export class ShareHttpApi {
  private readonly deps: ShareHttpApiDeps

  constructor(deps: ShareHttpApiDeps) {
    this.deps = deps
  }

  static handles(url: URL): boolean {
    return url.pathname === SHARE_API_PATH || url.pathname.startsWith(`${SHARE_API_PATH}/`) || IMAGE_ROUTE.test(url.pathname)
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    try {
      const image = IMAGE_ROUTE.exec(url.pathname)
      if (image !== null) return await this.image(request, url, image[1] ?? '')
      if (url.pathname === SHARE_API_PATH) return request.method === 'POST' ? await this.create(request, url) : this.methodNotAllowed('POST')
      const record = RECORD_ROUTE.exec(url.pathname)
      const id = record?.[1] ?? ''
      if (!SHARE_ID_PATTERN.test(id)) return this.error('notFound')
      if (request.method === 'GET') return await this.read(id)
      if (request.method === 'DELETE') return await this.remove(request, url, id)
      return this.methodNotAllowed('GET, DELETE')
    } catch (error) {
      // The store (Durable Object RPC) failed: logged with its detail, reported as unavailable.
      console.error(`Share API: ${request.method} ${url.pathname} failed`, error)
      return this.error('unavailable')
    }
  }

  private async create(request: Request, url: URL): Promise<Response> {
    const refused = await this.guardWrite(request, url)
    if (refused !== null) return refused
    const declared = Number(request.headers.get('Content-Length') ?? '0')
    if (declared > SHARE_LIMITS.requestBytes) return this.error('tooLarge')
    const body = await request.text()
    if (body.length > SHARE_LIMITS.requestBytes) return this.error('tooLarge')
    const outcome = await this.deps.store().create(body)
    if (!outcome.ok) return this.error(outcome.error, outcome.message)
    return Response.json(
      { id: outcome.id, created: outcome.created, deleteToken: outcome.deleteToken },
      { status: outcome.created ? 201 : 200, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  private async read(id: string): Promise<Response> {
    const record = await this.deps.store().read(id)
    if (record === null) return this.error('notFound')
    // Snapshots never change; a deleted one may still be served from a cache for a few minutes.
    return Response.json(record, { headers: { 'Cache-Control': 'public, max-age=300' } })
  }

  private async remove(request: Request, url: URL, id: string): Promise<Response> {
    const refused = await this.guardWrite(request, url)
    if (refused !== null) return refused
    const token = /^Bearer ([A-Za-z0-9_-]{16,200})$/.exec(request.headers.get('Authorization') ?? '')?.[1]
    if (token === undefined) return this.error('forbidden', 'A delete token is required.')
    const outcome = await this.deps.store().remove(id, token)
    if (outcome === 'deleted') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    return this.error(outcome)
  }

  private async image(request: Request, url: URL, id: string): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return this.methodNotAllowed('GET, HEAD')
    const png = SHARE_ID_PATTERN.test(id) ? await this.deps.store().image(id) : null
    if (png === null) return Response.redirect(new URL('/ogImage.png', url.origin).toString(), 302)
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
  }

  /** Writes: only from the app's own pages (Origin), and under the per-IP rate limit. */
  private async guardWrite(request: Request, url: URL): Promise<Response | null> {
    const origin = request.headers.get('Origin')
    if (origin !== url.origin && this.deps.origins.allowed(request) === null) return this.error('forbidden', 'Share pages can only be created from Octetlab.')
    if (!(await this.deps.limiter.allows(request))) return this.error('tooManyRequests', MESSAGES.tooManyRequests, { 'Retry-After': '60' })
    return null
  }

  private methodNotAllowed(allow: string): Response {
    return Response.json({ error: 'invalidRequest', message: `Use ${allow}.` }, { status: 405, headers: { Allow: allow, 'Cache-Control': 'no-store' } })
  }

  private error(code: ShareErrorCode, message: string = MESSAGES[code], extra: Record<string, string> = {}): Response {
    return Response.json({ error: code, message }, { status: STATUS[code], headers: { 'Cache-Control': 'no-store', ...extra } })
  }
}
