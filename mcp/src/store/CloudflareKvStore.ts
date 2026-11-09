// KeyValueStore on a Workers KV namespace binding.
import type { KvNamespaceBinding } from '../platform/WorkerBindings'
import type { KeyValueStore } from './KeyValueStore'

export class CloudflareKvStore implements KeyValueStore {
  private readonly namespace: KvNamespaceBinding

  constructor(namespace: KvNamespaceBinding) {
    this.namespace = namespace
  }

  get(key: string): Promise<string | null> {
    return this.namespace.get(key, 'text')
  }

  put(key: string, value: string, ttlSeconds: number): Promise<void> {
    return this.namespace.put(key, value, { expirationTtl: ttlSeconds })
  }
}
