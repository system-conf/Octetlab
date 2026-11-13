// Delete tokens of the share pages this browser created (docs/SHARE_PAGES.md §8). The server keeps
// only a hash of each token; losing the browser data means the page can no longer be deleted by its
// creator (a deliberate trade-off: no accounts).
import { z } from 'zod'
import { SHARE_ID_PATTERN } from './shareContract'

const STORAGE_KEY = 'octetlab.shareTokens'
const tokensSchema = z.record(z.string().regex(SHARE_ID_PATTERN), z.string().min(16).max(200))

/** The part of Storage this store uses (localStorage, or a fake in tests). */
export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class ShareTokenStore {
  private readonly storage: TokenStorage | null

  constructor(storage: TokenStorage | null) {
    this.storage = storage
  }

  /** localStorage, or a store that remembers nothing when the browser blocks it. */
  static browser(): ShareTokenStore {
    try {
      return new ShareTokenStore(window.localStorage)
    } catch (error) {
      console.warn('Share pages: browser storage is blocked; delete tokens are not kept.', error)
      return new ShareTokenStore(null)
    }
  }

  tokenOf(shareId: string): string | null {
    return this.read()[shareId] ?? null
  }

  /** Remembers a token; false when it could not be stored (the dialog then warns). */
  remember(shareId: string, token: string): boolean {
    return this.write({ ...this.read(), [shareId]: token })
  }

  forget(shareId: string): void {
    const { [shareId]: removed, ...rest } = this.read()
    if (removed !== undefined) this.write(rest)
  }

  private read(): Record<string, string> {
    if (this.storage === null) return {}
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (raw === null) return {}
      const parsed = tokensSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
      console.warn('Share pages: stored delete tokens are unreadable and were ignored.', parsed.error.message)
      return {}
    } catch (error) {
      console.warn('Share pages: stored delete tokens could not be read.', error)
      return {}
    }
  }

  private write(tokens: Record<string, string>): boolean {
    if (this.storage === null) return false
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(tokens))
      return true
    } catch (error) {
      console.warn('Share pages: the delete token could not be stored.', error)
      return false
    }
  }
}
