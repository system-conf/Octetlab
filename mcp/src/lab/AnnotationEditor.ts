// edit_annotations: text notes, rectangles, ellipses and lines on the lab's canvas
// (LabDocument.annotations), added / changed / removed through LabEditor. Inputs are flat field bags
// (easier for assistants than nested unions); the fields each type takes are checked here.
import type { Annotation, AnnotationColor, CanvasPoint, LabDocument } from '../../../src/domain'
import { labEditor } from '../../../src/lab/LabEditor'
import { LAB_LIMITS } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'

export type AnnotationType = Annotation['type']

export interface AnnotationFields {
  at?: CanvasPoint | undefined
  from?: CanvasPoint | undefined
  to?: CanvasPoint | undefined
  text?: string | undefined
  size?: 'small' | 'medium' | 'large' | undefined
  color?: AnnotationColor | undefined
  width?: number | undefined
  height?: number | undefined
  /** '' removes a shape's label. */
  label?: string | undefined
  filled?: boolean | undefined
  arrow?: boolean | undefined
}

export interface NewAnnotation extends AnnotationFields {
  type: AnnotationType
}

export interface AnnotationChange extends AnnotationFields {
  id: string
}

export interface AnnotationEdits {
  add: readonly NewAnnotation[]
  update: readonly AnnotationChange[]
  remove: readonly string[]
}

export interface AnnotationEditResult {
  doc: LabDocument
  added: string[]
  updated: string[]
  removed: string[]
}

/** The fields each annotation type takes (the first ones are required for a new annotation). */
export const ANNOTATION_FIELDS: Readonly<Record<AnnotationType, readonly (keyof AnnotationFields)[]>> = {
  text: ['at', 'text', 'size', 'color'],
  rectangle: ['at', 'width', 'height', 'label', 'filled', 'color'],
  ellipse: ['at', 'width', 'height', 'label', 'filled', 'color'],
  line: ['from', 'to', 'arrow', 'color'],
}

const ALL_FIELDS: readonly (keyof AnnotationFields)[] = ['at', 'from', 'to', 'text', 'size', 'color', 'width', 'height', 'label', 'filled', 'arrow']

function point(value: CanvasPoint): CanvasPoint {
  return { x: value.x, y: value.y }
}

export class AnnotationEditor {
  edit(doc: LabDocument, edits: AnnotationEdits): AnnotationEditResult {
    if (edits.add.length + edits.update.length + edits.remove.length === 0) throw ToolError.validation('Give at least one annotation to add, update or remove.')
    const kept = doc.annotations.length - new Set(edits.remove).size
    if (kept + edits.add.length > LAB_LIMITS.annotations) {
      throw ToolError.limit(`A lab can have at most ${LAB_LIMITS.annotations} annotations; this one would have ${kept + edits.add.length}.`)
    }
    let next = doc
    const result: Omit<AnnotationEditResult, 'doc'> = { added: [], updated: [], removed: [] }
    edits.update.forEach((change, index) => {
      const existing = this.require(next, change.id, `update[${index}]`)
      this.checkFields(existing.type, change, `update[${index}] (${change.id})`)
      next = labEditor.updateAnnotation(next, this.annotationOf(existing.id, existing.type, change, `update[${index}]`, existing))
      result.updated.push(existing.id)
    })
    edits.remove.forEach((id, index) => {
      this.require(next, id, `remove[${index}]`)
      next = labEditor.removeAnnotation(next, id)
      result.removed.push(id)
    })
    edits.add.forEach((annotation, index) => {
      this.checkFields(annotation.type, annotation, `add[${index}]`)
      const id = labEditor.nextAnnotationId(next)
      next = labEditor.addAnnotation(next, this.annotationOf(id, annotation.type, annotation, `add[${index}]`))
      result.added.push(id)
    })
    return { doc: next, ...result }
  }

  private require(doc: LabDocument, id: string, where: string): Annotation {
    const annotation = doc.annotations.find((candidate) => candidate.id === id)
    if (annotation !== undefined) return annotation
    const known = doc.annotations.map((candidate) => candidate.id).join(', ') || '(none)'
    throw ToolError.notFound(`${where}: annotation "${id}" is not in this lab. Annotations: ${known}.`)
  }

  private checkFields(type: AnnotationType, fields: AnnotationFields, where: string): void {
    const allowed: readonly string[] = ANNOTATION_FIELDS[type]
    const extra = ALL_FIELDS.filter((key) => fields[key] !== undefined && !allowed.includes(key))
    if (extra.length > 0) throw ToolError.validation(`${where}: a ${type} annotation has no ${extra.join(', ')} (it takes ${allowed.join(', ')}).`)
  }

  /** The annotation from `fields` on top of `base` (an update) or the defaults (a new one). */
  private annotationOf(id: string, type: AnnotationType, fields: AnnotationFields, where: string, base?: Annotation): Annotation {
    const missing = (names: string): never => {
      throw ToolError.validation(`${where}: a new ${type} annotation needs ${names}.`)
    }
    switch (type) {
      case 'text': {
        const old = base?.type === 'text' ? base : undefined
        const at = fields.at ?? old?.at ?? missing('at and text')
        const text = fields.text ?? old?.text ?? missing('at and text')
        if (text.trim() === '') throw ToolError.validation(`${where}: text must not be blank (remove the annotation instead).`)
        return { id, type, at: point(at), text, size: fields.size ?? old?.size ?? 'medium', color: fields.color ?? old?.color ?? 'amber' }
      }
      case 'rectangle':
      case 'ellipse': {
        const old = base?.type === 'rectangle' || base?.type === 'ellipse' ? base : undefined
        const at = fields.at ?? old?.at ?? missing('at, width and height')
        const width = fields.width ?? old?.width ?? missing('at, width and height')
        const height = fields.height ?? old?.height ?? missing('at, width and height')
        const label = fields.label === undefined ? old?.label : fields.label.trim() === '' ? undefined : fields.label
        const shape = { id, type, at: point(at), width, height, filled: fields.filled ?? old?.filled ?? false, color: fields.color ?? old?.color ?? 'neutral' }
        return label === undefined ? shape : { ...shape, label }
      }
      case 'line': {
        const old = base?.type === 'line' ? base : undefined
        const from = fields.from ?? old?.from ?? missing('from and to')
        const to = fields.to ?? old?.to ?? missing('from and to')
        return { id, type, from: point(from), to: point(to), arrow: fields.arrow ?? old?.arrow ?? false, color: fields.color ?? old?.color ?? 'neutral' }
      }
    }
  }
}
