// In-memory RoomStorage for tests and the in-process room gateway (structured-clone copies, like the
// Durable Object storage API, so callers cannot change stored values by reference).
import type { RoomStorage } from './RoomStorage'

export class MemoryRoomStorage implements RoomStorage {
  private readonly entries = new Map<string, unknown>()
  /** The scheduled alarm time, or null. */
  alarmAt: number | null = null

  get(keys: string[]): Promise<Map<string, unknown>> {
    const found = new Map<string, unknown>()
    for (const key of keys) {
      if (this.entries.has(key)) found.set(key, structuredClone(this.entries.get(key)))
    }
    return Promise.resolve(found)
  }

  put(entries: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(entries)
    if (keys.length > 128) return Promise.reject(new Error('put() takes at most 128 entries'))
    for (const key of keys) this.entries.set(key, structuredClone(entries[key]))
    return Promise.resolve()
  }

  delete(keys: string[]): Promise<number> {
    return Promise.resolve(keys.filter((key) => this.entries.delete(key)).length)
  }

  deleteAll(): Promise<void> {
    this.entries.clear()
    this.alarmAt = null
    return Promise.resolve()
  }

  setAlarm(scheduledTime: number): Promise<void> {
    this.alarmAt = scheduledTime
    return Promise.resolve()
  }

  /** Stored keys (tests). */
  keys(): string[] {
    return [...this.entries.keys()].sort()
  }
}
