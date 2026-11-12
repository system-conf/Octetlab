// How the Worker reaches a lab's room: Durable Object RPC in production (DurableLabRooms), an
// in-process LabRoomState per lab in tests (MemoryLabRooms).
import type { LiveEventDraft } from './LiveEvent'
import type { CreateResult, NoteResult, RoomDoc, RoomSnapshot, WriteResult } from './LabRoomState'

/** The room's RPC surface (docs/LIVE_LABS.md §3). */
export interface LabRoomClient {
  create(docText: string, event?: LiveEventDraft): Promise<CreateResult>
  read(): Promise<RoomDoc | null>
  snapshot(): Promise<RoomSnapshot | null>
  write(docText: string, expectedVersion: number, event: LiveEventDraft): Promise<WriteResult>
  note(event: LiveEventDraft): Promise<NoteResult>
}

export interface LabRooms {
  room(labId: string): LabRoomClient
  /** Hands a (checked) WebSocket upgrade request to the lab's room. */
  connect(labId: string, request: Request): Promise<Response>
}
