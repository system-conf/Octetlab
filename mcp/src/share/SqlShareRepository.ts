// ShareRepository on SQLite (the ShareStore Durable Object's ctx.storage.sql; node:sqlite in tests).
// A Durable Object runs one request at a time and every statement below is synchronous, so each
// method is atomic; transaction() makes the multi-statement ones explicit.
import type { DeleteOutcome, InsertOutcome, NewShare, ShareRepository, StoredShare } from './ShareRepository'

export type SqlValue = string | number | null | ArrayBuffer
/** Column values as SQLite drivers hand them out (BLOBs: ArrayBuffer in Workers, Uint8Array in Node). */
export type SqlCell = SqlValue | Uint8Array

export interface SqlPort {
  run(query: string, ...bindings: SqlValue[]): { rows: Record<string, SqlCell>[]; rowsWritten: number }
  transaction<T>(body: () => T): T
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL UNIQUE,
    delete_token_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    linkedin_url TEXT NOT NULL,
    description TEXT NOT NULL,
    doc_text TEXT NOT NULL,
    og_png BLOB,
    created_at TEXT NOT NULL
  )`,
]

const COLUMNS = 'id, content_hash, title, author, linkedin_url, description, doc_text, created_at, og_png IS NOT NULL AS has_image'

export class SqlShareRepository implements ShareRepository {
  private readonly sql: SqlPort

  constructor(sql: SqlPort) {
    this.sql = sql
    for (const statement of SCHEMA) this.sql.run(statement)
  }

  insert(share: NewShare): InsertOutcome {
    return this.sql.transaction(() => {
      // ON CONFLICT without a target covers both UNIQUE columns: the content hash (same lab shared
      // again) and the id (random collision). The SELECT tells them apart.
      this.sql.run(
        `INSERT INTO shares (id, content_hash, delete_token_hash, title, author, linkedin_url, description, doc_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        share.id,
        share.contentHash,
        share.deleteTokenHash,
        share.title,
        share.author,
        share.linkedinUrl,
        share.description,
        share.docText,
        share.createdAt,
      )
      const owner = this.sql.run('SELECT id FROM shares WHERE content_hash = ?', share.contentHash).rows[0]
      if (owner === undefined) return { kind: 'idTaken' }
      const id = SqlShareRepository.text(owner, 'id')
      return id === share.id ? { kind: 'created', id } : { kind: 'existing', id }
    })
  }

  find(id: string): StoredShare | null {
    const row = this.sql.run(`SELECT ${COLUMNS} FROM shares WHERE id = ?`, id).rows[0]
    if (row === undefined) return null
    return {
      id: SqlShareRepository.text(row, 'id'),
      contentHash: SqlShareRepository.text(row, 'content_hash'),
      title: SqlShareRepository.text(row, 'title'),
      author: SqlShareRepository.text(row, 'author'),
      linkedinUrl: SqlShareRepository.text(row, 'linkedin_url'),
      description: SqlShareRepository.text(row, 'description'),
      docText: SqlShareRepository.text(row, 'doc_text'),
      createdAt: SqlShareRepository.text(row, 'created_at'),
      hasImage: row['has_image'] === 1,
    }
  }

  image(id: string): Uint8Array | null {
    const value = this.sql.run('SELECT og_png FROM shares WHERE id = ?', id).rows[0]?.['og_png']
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    return null
  }

  setImage(id: string, png: Uint8Array): void {
    const copy = png.slice().buffer
    this.sql.run('UPDATE shares SET og_png = ? WHERE id = ?', copy, id)
  }

  delete(id: string, deleteTokenHash: string): DeleteOutcome {
    return this.sql.transaction(() => {
      const row = this.sql.run('SELECT delete_token_hash FROM shares WHERE id = ?', id).rows[0]
      if (row === undefined) return 'notFound'
      if (!SqlShareRepository.sameHash(SqlShareRepository.text(row, 'delete_token_hash'), deleteTokenHash)) return 'forbidden'
      this.sql.run('DELETE FROM shares WHERE id = ?', id)
      return 'deleted'
    })
  }

  count(): number {
    const value = this.sql.run('SELECT COUNT(*) AS total FROM shares').rows[0]?.['total']
    return typeof value === 'number' ? value : 0
  }

  private static text(row: Record<string, SqlCell>, column: string): string {
    const value = row[column]
    if (typeof value !== 'string') throw new Error(`ShareStore: column ${column} is not text`)
    return value
  }

  /** Compares two hex digests without stopping at the first difference. */
  private static sameHash(stored: string, given: string): boolean {
    if (stored.length !== given.length) return false
    let difference = 0
    for (let index = 0; index < stored.length; index++) difference |= stored.charCodeAt(index) ^ given.charCodeAt(index)
    return difference === 0
  }
}
