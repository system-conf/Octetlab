// What LabStore needs from a key-value store: Workers KV in production, MemoryKeyValueStore in tests.

export interface KeyValueStore {
  get(key: string): Promise<string | null>
  /** `ttlSeconds`: the entry expires this long after the write. */
  put(key: string, value: string, ttlSeconds: number): Promise<void>
}
