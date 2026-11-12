// update_lab_info: the lab's title and description (LabMeta) and its notebook (LabDocument.notes),
// changed through LabEditor like the app's title field and notes panel.
import type { LabDocument } from '../../../src/domain'
import { labEditor } from '../../../src/lab/LabEditor'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'

export interface LabInfoRequest {
  title?: string | undefined
  /** '' clears it. */
  description?: string | undefined
  /** Replaces the notes ('' clears them). */
  notes?: string | undefined
  /** Added at the end of the notes on a new line. */
  appendNotes?: string | undefined
}

export interface LabInfoResult {
  doc: LabDocument
  /** What changed, in words: "title", "description", "notes". */
  changes: string[]
}

export class LabInfoEditor {
  update(doc: LabDocument, request: LabInfoRequest): LabInfoResult {
    if (request.notes !== undefined && request.appendNotes !== undefined) {
      throw ToolError.validation('Give either notes (replace) or appendNotes (add at the end), not both.')
    }
    const changes: string[] = []
    let next = doc
    if (request.title !== undefined) {
      next = labEditor.updateMeta(next, { title: request.title.trim() })
      changes.push('title')
    }
    if (request.description !== undefined) {
      next = labEditor.updateMeta(next, { description: request.description.trim() })
      changes.push('description')
    }
    const notes = this.notesOf(doc.notes, request)
    if (notes !== undefined) {
      next = labEditor.setNotes(next, notes)
      changes.push('notes')
    }
    if (changes.length === 0) throw ToolError.validation('Give at least one of title, description, notes or appendNotes.')
    return { doc: next, changes }
  }

  private notesOf(current: string, request: LabInfoRequest): string | undefined {
    const notes = request.appendNotes === undefined ? request.notes : current === '' ? request.appendNotes : `${current}\n${request.appendNotes}`
    if (notes !== undefined && notes.length > LAB_LIMITS.notesLength) {
      throw ToolError.limit(`The notes would be ${notes.length} characters long; the limit is ${LAB_LIMITS.notesLength}. Shorten them or replace them with notes.`)
    }
    return notes
  }
}
