// In-memory KeyValueStore for tests (expiry by an injectable clock, like KV's expirationTtl).
import type { KeyValueStore } from './KeyValueStore'

interface Entry {
  value: string
  expiresAt: number
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, Entry>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key)
    if (entry === undefined || entry.expiresAt <= this.now()) return Promise.resolve(null)
    return Promise.resolve(entry.value)
  }

  put(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 })
    return Promise.resolve()
  }

  /** Number of stored entries, expired ones included (tests). */
  get size(): number {
    return this.entries.size
  }
}
