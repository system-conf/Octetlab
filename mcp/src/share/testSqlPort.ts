/// <reference types="node" />
// Test-only SqlPort over node:sqlite, so the share repository's real SQL (UNIQUE constraints,
// ON CONFLICT) runs in unit tests the same way it runs in the Durable Object's SQLite.
import { DatabaseSync } from 'node:sqlite'
import type { SqlCell, SqlPort, SqlValue } from './SqlShareRepository'

export function memorySqlPort(): SqlPort {
  const db = new DatabaseSync(':memory:')
  const toNode = (value: SqlValue) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value)
  return {
    run(query, ...bindings) {
      const statement = db.prepare(query)
      const params = bindings.map(toNode)
      if (/^\s*SELECT/i.test(query)) return { rows: statement.all(...params) as Record<string, SqlCell>[], rowsWritten: 0 }
      const result = statement.run(...params)
      return { rows: [], rowsWritten: Number(result.changes) }
    },
    transaction(body) {
      db.exec('BEGIN')
      try {
        const result = body()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}
