// After a new deploy the old hashed chunks are gone. A tab opened before the deploy then fails to
// lazy-load a screen (Vite fires 'vite:preloadError'). Reloading once fetches the new index.html and
// its new chunks. A time guard in sessionStorage stops a reload loop when a chunk is really missing.

const STORAGE_KEY = 'agArizaLab.staleChunkReloadAt'
/** Do not reload again within this many ms of the last recovery reload. */
const RELOAD_GUARD_MS = 10_000

interface RecoveryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface RecoveryEvent {
  preventDefault(): void
}

export class StaleChunkRecovery {
  private readonly storage: RecoveryStorage
  private readonly reload: () => void
  private readonly now: () => number

  constructor(storage: RecoveryStorage, reload: () => void, now: () => number = Date.now) {
    this.storage = storage
    this.reload = reload
    this.now = now
  }

  /** Listen for Vite's chunk load failures on `target` (the window). Returns the unsubscribe. */
  listen(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
    const handler = (event: Event) => this.handle(event)
    target.addEventListener('vite:preloadError', handler)
    return () => target.removeEventListener('vite:preloadError', handler)
  }

  /**
   * Reloads once and suppresses the error; returns true when it did. Within the guard window (or when
   * storage fails) it leaves the error alone so it stays visible instead of looping.
   */
  handle(event: RecoveryEvent): boolean {
    if (!this.mayReload()) return false
    event.preventDefault()
    this.reload()
    return true
  }

  private mayReload(): boolean {
    try {
      const last = Number(this.storage.getItem(STORAGE_KEY))
      const current = this.now()
      if (Number.isFinite(last) && last > 0 && current - last < RELOAD_GUARD_MS) {
        console.warn('Chunk failed to load again right after a recovery reload; not reloading.')
        return false
      }
      this.storage.setItem(STORAGE_KEY, String(current))
      return true
    } catch (error: unknown) {
      console.warn('Stale chunk recovery cannot use sessionStorage; not reloading.', error)
      return false
    }
  }
}
