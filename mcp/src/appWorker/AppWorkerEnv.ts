// Bindings of the app Worker (root wrangler.jsonc): the static assets plus the share store of the MCP
// Worker, declared with only the members used (like mcp/src/platform/WorkerBindings.ts).
import type { ShareRecord } from '../../../src/features/share/model/shareContract'
import type { DurableObjectNamespaceBinding, RateLimitBinding } from '../platform/WorkerBindings'
import type { DeleteOutcome } from '../share/ShareRepository'
import type { CreateOutcome, ShareMeta } from '../share/ShareService'

/** The ShareStore Durable Object's RPC methods (mcp/src/share/ShareStore.ts), as a stub sees them. */
export interface ShareStoreStub {
  create(bodyText: string): Promise<CreateOutcome>
  read(id: string): Promise<ShareRecord | null>
  meta(id: string): Promise<ShareMeta | null>
  image(id: string): Promise<Uint8Array | null>
  remove(id: string, deleteToken: string): Promise<DeleteOutcome>
}

/** The static-assets binding (`assets.binding`). */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface AppWorkerEnv {
  ASSETS: AssetsBinding
  /** Cross-script binding to the MCP Worker's ShareStore (script_name "octetlabmcp"). */
  SHARE_STORE: DurableObjectNamespaceBinding<ShareStoreStub>
  /** Creating and deleting share pages, per client IP. */
  SHARE_WRITE_LIMITER: RateLimitBinding
  /** Extra origins allowed to create / delete shares besides the app's own (local development). */
  APP_ORIGINS: string
}
