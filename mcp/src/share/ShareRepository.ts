// Storage of share snapshots (docs/SHARE_PAGES.md §3). The SQL implementation runs inside the
// ShareStore Durable Object; dedup of identical content is the table's UNIQUE(content_hash), not a
// read-then-write check in code (repository rule: idempotency through a UNIQUE constraint).

export interface NewShare {
  id: string
  /** SHA-256 (hex) of the canonical lab text and the page texts. */
  contentHash: string
  /** SHA-256 (hex) of the creator's delete token; the token itself is never stored. */
  deleteTokenHash: string
  title: string
  author: string
  linkedinUrl: string
  description: string
  /** Canonical compact lab JSON. */
  docText: string
  /** ISO 8601. */
  createdAt: string
}

export interface StoredShare extends Omit<NewShare, 'deleteTokenHash'> {
  hasImage: boolean
}

/** Result of an insert: the id that now holds this content, and whether this call created it. */
export type InsertOutcome = { kind: 'created'; id: string } | { kind: 'existing'; id: string } | { kind: 'idTaken' }

export type DeleteOutcome = 'deleted' | 'notFound' | 'forbidden'

export interface ShareRepository {
  /**
   * Inserts the share unless the same content exists (then returns that share's id). `idTaken`:
   * the random id collided with another share; the caller retries with a new id.
   */
  insert(share: NewShare): InsertOutcome
  find(id: string): StoredShare | null
  image(id: string): Uint8Array | null
  setImage(id: string, png: Uint8Array): void
  /** Deletes the share when `deleteTokenHash` matches. */
  delete(id: string, deleteTokenHash: string): DeleteOutcome
  count(): number
}
