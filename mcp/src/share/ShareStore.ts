// The ShareStore Durable Object (docs/SHARE_PAGES.md §3): one instance (SHARE_STORE_NAME) holds
// every share in its SQLite database, so UNIQUE(content_hash) deduplicates across all users. A thin
// adapter from the Workers runtime to ShareService; the app Worker calls these methods over RPC
// through a cross-script Durable Object binding (script_name "octetlabmcp").
import { DurableObject } from 'cloudflare:workers'
import type { ShareRecord } from '../../../src/features/share/model/shareContract'
import type { WorkerEnv } from '../platform/WorkerBindings'
import { ResvgPngRenderer } from './ResvgPngRenderer'
import type { DeleteOutcome } from './ShareRepository'
import { ShareService, type CreateOutcome, type ShareMeta } from './ShareService'
import { SqlShareRepository, type SqlPort } from './SqlShareRepository'

export class ShareStore extends DurableObject<WorkerEnv> {
  private readonly service: ShareService

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    const storage = ctx.storage
    const sql: SqlPort = {
      run: (query, ...bindings) => {
        const cursor = storage.sql.exec(query, ...bindings)
        const rows = cursor.toArray()
        return { rows, rowsWritten: cursor.rowsWritten }
      },
      transaction: (body) => storage.transactionSync(body),
    }
    this.service = new ShareService(new SqlShareRepository(sql), new ResvgPngRenderer())
  }

  create(bodyText: string): Promise<CreateOutcome> {
    return this.service.create(bodyText)
  }

  read(id: string): ShareRecord | null {
    return this.service.read(id)
  }

  meta(id: string): ShareMeta | null {
    return this.service.meta(id)
  }

  image(id: string): Uint8Array | null {
    return this.service.image(id)
  }

  remove(id: string, deleteToken: string): Promise<DeleteOutcome> {
    return this.service.remove(id, deleteToken)
  }
}
