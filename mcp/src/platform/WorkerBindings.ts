// The Worker's bindings (mcp/wrangler.jsonc), declared with only the members this Worker uses so the
// code type-checks against the same DOM lib as Octetlab's modules (no global Workers runtime types).
import type { LabRoomClient } from '../live/LabRooms'

/** A LabRoom stub: its RPC methods plus fetch (WebSocket upgrades). */
export interface LabRoomStub extends LabRoomClient {
  fetch(request: Request): Promise<Response>
}

/** Opaque Durable Object id. */
export interface DurableObjectIdBinding {
  toString(): string
}

/** Durable Object namespace binding (`durable_objects.bindings` in wrangler.jsonc). */
export interface DurableObjectNamespaceBinding<Stub> {
  idFromName(name: string): DurableObjectIdBinding
  get(id: DurableObjectIdBinding): Stub
}

/** Workers KV namespace (text values only). */
export interface KvNamespaceBinding {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

/** Workers rate-limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface WorkerEnv {
  /** One LabRoom Durable Object per lab (docs/LIVE_LABS.md §3). */
  LAB_ROOMS: DurableObjectNamespaceBinding<LabRoomStub>
  /** Labs stored before live labs (key `lab:<id>`, 7-day TTL): read-only fallback until the contract step. */
  LABS: KvNamespaceBinding
  MCP_RATE_LIMITER: RateLimitBinding
  /** Web app page that opens share links, e.g. https://octetlab.slovveis.workers.dev/lab. */
  APP_LAB_URL: string
  /** Web app origin for live links (`<APP_ORIGIN>/live/<labId>`). */
  APP_ORIGIN: string
  /** Comma-separated origins allowed to read /live/* and open its socket. */
  APP_ORIGINS: string
}
