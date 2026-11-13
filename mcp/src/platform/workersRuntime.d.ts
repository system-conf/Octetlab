// The Workers runtime APIs the live-lab room uses (docs/LIVE_LABS.md §3, §6), declared with only the
// members this Worker uses, like WorkerBindings.ts (the project has no @cloudflare/workers-types; the
// code type-checks against the DOM lib). Shapes follow developers.cloudflare.com/durable-objects/api/.

/** ctx.storage of a SQLite-backed Durable Object: the async key-value API. */
interface DurableObjectStorage {
  get(keys: string[]): Promise<Map<string, unknown>>
  put(entries: Record<string, unknown>): Promise<void>
  delete(keys: string[]): Promise<number>
  deleteAll(): Promise<void>
  setAlarm(scheduledTime: number | Date): Promise<void>
  /** Share pages: the SQL API of SQLite-backed objects (developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). */
  readonly sql: SqlStorage
  transactionSync<T>(body: () => T): T
}

type SqlStorageValue = string | number | null | ArrayBuffer

interface SqlStorageCursor {
  toArray(): Record<string, SqlStorageValue>[]
  readonly rowsWritten: number
}

interface SqlStorage {
  exec(query: string, ...bindings: SqlStorageValue[]): SqlStorageCursor
}

/** `.wasm` imports: wrangler compiles them into a WebAssembly.Module at upload time. */
declare module '*.wasm' {
  const module: WebAssembly.Module
  export default module
}

/** ctx of a Durable Object: storage plus the WebSocket Hibernation API. */
interface DurableObjectState {
  readonly storage: DurableObjectStorage
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): WebSocket[]
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void
}

/** `new WebSocketPair()`: [client, server]. */
declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

/** A message the runtime answers without waking the object (the hibernation auto-response). */
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
}

/** Workers' Response accepts the client end of a WebSocketPair for a 101 upgrade. */
interface ResponseInit {
  webSocket?: WebSocket | null
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState
    protected readonly env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
