// The app's side of the share API (docs/SHARE_PAGES.md §5). Same origin as the app (served by the app
// Worker), so no CORS. Every answer is validated with the shared zod schemas; every failure becomes a
// ShareApiError with a code the UI translates (the technical detail goes to the console only).
import type { z } from 'zod'
import {
  SHARE_API_PATH,
  shareCreatedSchema,
  shareErrorSchema,
  shareRecordSchema,
  type ShareCreated,
  type ShareDraftInput,
  type ShareErrorCode,
  type ShareRecord,
} from './shareContract'

/** What can go wrong, as the UI explains it: the server's codes plus the client's own. */
export type ShareFailure = ShareErrorCode | 'unexpected'

export class ShareApiError extends Error {
  readonly code: ShareFailure

  constructor(code: ShareFailure, detail: string) {
    super(`Share API (${code}): ${detail}`)
    this.name = 'ShareApiError'
    this.code = code
  }
}

export type FetchPort = (input: string, init?: RequestInit) => Promise<Response>

export class ShareApiClient {
  private readonly fetcher: FetchPort
  private readonly origin: string

  /** `origin`: the app origin (window.location.origin). */
  constructor(fetcher: FetchPort, origin: string) {
    this.fetcher = fetcher
    this.origin = origin
  }

  static browser(): ShareApiClient {
    return new ShareApiClient((input, init) => fetch(input, init), window.location.origin)
  }

  /** Public page URL of a share. */
  pageUrl(id: string): string {
    return new URL(`/p/${encodeURIComponent(id)}`, this.origin).toString()
  }

  create(draft: ShareDraftInput): Promise<ShareCreated> {
    return this.request(SHARE_API_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }, shareCreatedSchema)
  }

  get(id: string): Promise<ShareRecord> {
    return this.request(`${SHARE_API_PATH}/${encodeURIComponent(id)}`, { method: 'GET' }, shareRecordSchema)
  }

  async remove(id: string, deleteToken: string): Promise<void> {
    const response = await this.send(`${SHARE_API_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${deleteToken}` } })
    if (response.status !== 204) throw await this.failure(response)
  }

  private async request<Schema extends z.ZodType>(path: string, init: RequestInit, schema: Schema): Promise<z.infer<Schema>> {
    const response = await this.send(path, init)
    if (!response.ok) throw await this.failure(response)
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      throw new ShareApiError('unexpected', `answer is not JSON: ${String(error)}`)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ShareApiError('unexpected', `answer does not match the contract: ${parsed.error.message}`)
    return parsed.data
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(new URL(path, this.origin).toString(), init)
    } catch (error) {
      throw new ShareApiError('unavailable', `network error: ${String(error)}`)
    }
  }

  /** The server's error code when the body has one, else one derived from the status. */
  private async failure(response: Response): Promise<ShareApiError> {
    let body: unknown = null
    try {
      body = await response.json()
    } catch (error) {
      console.warn(`Share API: ${response.status} answer without a JSON body`, error)
    }
    const parsed = shareErrorSchema.safeParse(body)
    if (parsed.success) return new ShareApiError(parsed.data.error, `${response.status} ${parsed.data.message}`)
    const byStatus: Partial<Record<number, ShareFailure>> = { 400: 'invalidRequest', 403: 'forbidden', 404: 'notFound', 413: 'tooLarge', 429: 'tooManyRequests', 503: 'unavailable' }
    return new ShareApiError(byStatus[response.status] ?? 'unexpected', `HTTP ${response.status}`)
  }
}
