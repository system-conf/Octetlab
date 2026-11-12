// The LabRoom Durable Object (docs/LIVE_LABS.md §3, §6): a thin adapter from the Workers runtime
// (SQLite-backed storage, alarm, WebSocket Hibernation API) to LabRoomState, which holds the logic.
// Watchers are accepted with ctx.acceptWebSocket so the object can hibernate while they are idle;
// pings are answered by the runtime's auto-response without waking it.
import { DurableObject } from 'cloudflare:workers'
import type { WorkerEnv } from '../platform/WorkerBindings'
import { PING_MESSAGE, PONG_MESSAGE, type LiveEventDraft } from './LiveEvent'
import { LabRoomState, type CreateResult, type NoteResult, type RoomDoc, type RoomSnapshot, type WriteResult } from './LabRoomState'
import type { LabRoomClient } from './LabRooms'

export class LabRoom extends DurableObject<WorkerEnv> implements LabRoomClient {
  private readonly state: LabRoomState

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    this.state = new LabRoomState(ctx.storage, () => ctx.getWebSockets())
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_MESSAGE, PONG_MESSAGE))
  }

  create(docText: string, event?: LiveEventDraft): Promise<CreateResult> {
    return this.state.create(docText, event)
  }

  read(): Promise<RoomDoc | null> {
    return this.state.read()
  }

  snapshot(): Promise<RoomSnapshot | null> {
    return this.state.snapshot()
  }

  write(docText: string, expectedVersion: number, event: LiveEventDraft): Promise<WriteResult> {
    return this.state.write(docText, expectedVersion, event)
  }

  note(event: LiveEventDraft): Promise<NoteResult> {
    return this.state.note(event)
  }

  /** WebSocket upgrades only (the Worker checked the Origin, rate limit and Upgrade header). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket upgrade.', { status: 426 })
    const admitted = await this.state.admit()
    if (!admitted.ok) return new Response(admitted.message, { status: admitted.status })
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.send(admitted.snapshot)
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    this.state.message(ws, message)
  }

  // No webSocketClose handler: since compatibility date 2026-04-07 (web_socket_auto_reply_to_close) the
  // runtime answers a watcher's close frame itself, and a closed socket leaves ctx.getWebSockets().

  webSocketError(_ws: WebSocket, error: unknown): void {
    console.warn('LabRoom: watcher socket error', error)
  }

  alarm(): Promise<void> {
    return this.state.alarm()
  }
}
