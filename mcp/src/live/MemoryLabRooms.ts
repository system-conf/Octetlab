// LabRooms in process, for tests: a real LabRoomState per lab on MemoryRoomStorage. Node cannot build a
// 101 response, so `connect` answers 200 when the room would accept the watcher (and records the
// snapshot it would send), or the room's refusal status.
import { LabRoomState } from './LabRoomState'
import type { LabRoomClient, LabRooms } from './LabRooms'
import { MemoryRoomStorage } from './MemoryRoomStorage'
import type { RoomSocket } from './RoomStorage'

export class RecordingSocket implements RoomSocket {
  readonly sent: string[] = []
  closed: { code: number; reason: string } | null = null

  send(message: string): void {
    if (this.closed !== null) throw new Error('socket is closed')
    this.sent.push(message)
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason }
  }
}

interface MemoryRoom {
  state: LabRoomState
  storage: MemoryRoomStorage
  sockets: RecordingSocket[]
}

export class MemoryLabRooms implements LabRooms {
  private readonly rooms = new Map<string, MemoryRoom>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  room(labId: string): LabRoomClient {
    return this.entry(labId).state
  }

  async connect(labId: string, request: Request): Promise<Response> {
    void request
    const room = this.entry(labId)
    const admitted = await room.state.admit()
    if (!admitted.ok) return new Response(admitted.message, { status: admitted.status })
    const socket = new RecordingSocket()
    room.sockets.push(socket)
    socket.send(admitted.snapshot)
    return new Response('accepted', { status: 200 })
  }

  /** The room's internals (tests). */
  entry(labId: string): MemoryRoom {
    let room = this.rooms.get(labId)
    if (room === undefined) {
      const storage = new MemoryRoomStorage()
      const sockets: RecordingSocket[] = []
      room = { storage, sockets, state: new LabRoomState(storage, () => sockets.filter((socket) => socket.closed === null), this.now) }
      this.rooms.set(labId, room)
    }
    return room
  }
}
