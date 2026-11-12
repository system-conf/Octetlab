// What LabRoomState needs from a Durable Object's storage (the async key-value API, available on
// SQLite-backed objects) and from its WebSockets. LabRoom adapts the real ones; tests use memory fakes.

export interface RoomStorage {
  get(keys: string[]): Promise<Map<string, unknown>>
  /** Atomic multi-key write (at most 128 entries). */
  put(entries: Record<string, unknown>): Promise<void>
  delete(keys: string[]): Promise<number>
  /** Deletes every key and (compatibility date ≥ 2026-02-24) the alarm. */
  deleteAll(): Promise<void>
  setAlarm(scheduledTime: number): Promise<void>
}

export interface RoomSocket {
  send(message: string): void
  close(code: number, reason: string): void
}
