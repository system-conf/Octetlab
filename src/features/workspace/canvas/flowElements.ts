// LabDocument → React Flow nodes and edges. Positions and selection come from the workspace,
// never from React Flow's own state (controlled flow).
import type { Annotation, CanvasPoint, Device, LabDocument, Link, LinkLight } from '../../../domain'
import { ANNOTATION_NODE_PREFIX } from '../workspaceConstants'
import type {
  AnnotationNode,
  CableHighlight,
  LinkFlowEdge,
  WorkspaceDeviceNode,
  WorkspaceNode,
  WorkspaceSelection,
} from './canvasTypes'

export type MeasuredSizes = Readonly<Record<string, { width: number; height: number }>>

export function annotationNodeId(annotationId: string): string {
  return `${ANNOTATION_NODE_PREFIX}${annotationId}`
}

/** Annotation id of a node id, or null for a device node. */
export function annotationIdOf(nodeId: string): string | null {
  return nodeId.startsWith(ANNOTATION_NODE_PREFIX) ? nodeId.slice(ANNOTATION_NODE_PREFIX.length) : null
}

/** Top-left point of an annotation's node (lines are not drawn as nodes). */
export function annotationPosition(annotation: Annotation): CanvasPoint | null {
  return annotation.type === 'line' ? null : annotation.at
}

/** The annotation moved to `to` (top-left of its node). */
export function moveAnnotation(annotation: Annotation, to: CanvasPoint): Annotation {
  if (annotation.type !== 'line') return { ...annotation, at: to }
  const dx = to.x - annotation.from.x
  const dy = to.y - annotation.from.y
  return { ...annotation, from: to, to: { x: annotation.to.x + dx, y: annotation.to.y + dy } }
}

/** The user's text of an annotation: note text or shape label ('' for lines and unlabeled shapes). */
export function annotationText(annotation: Annotation): string {
  if (annotation.type === 'text') return annotation.text
  return annotation.type === 'line' ? '' : (annotation.label ?? '')
}

/** Translated texts the builders need (rebuilt when the language changes). */
export interface FlowLabels {
  device: (device: Device) => string
  modelName: (device: Device) => string
  annotation: (annotation: Annotation) => string
  link: (link: Link, a: Device, b: Device) => string
}

export interface NodeInput {
  doc: LabDocument
  selection: WorkspaceSelection
  measured: MeasuredSizes
  labels: FlowLabels
  cableHighlight: (deviceId: string) => CableHighlight
  /** false: devices stay where they are (exercise with a locked topology). */
  devicesDraggable: boolean
  /** true: notes can be neither selected nor dragged (read-only live lab). Default false. */
  annotationsLocked?: boolean
}

export function buildNodes(input: NodeInput): WorkspaceNode[] {
  const notesLocked = input.annotationsLocked ?? false
  const { doc, selection, measured, labels } = input
  const annotationNodes: AnnotationNode[] = []
  for (const annotation of doc.annotations) {
    const at = annotationPosition(annotation)
    if (at === null) continue
    const id = annotationNodeId(annotation.id)
    const isShape = annotation.type === 'rectangle' || annotation.type === 'ellipse'
    annotationNodes.push({
      id,
      type: 'annotation',
      position: at,
      data: { annotation },
      selected: selection.annotationIds.includes(annotation.id),
      measured: measured[id],
      ariaLabel: labels.annotation(annotation),
      zIndex: isShape ? -1 : 0,
      ...(isShape ? { width: annotation.width, height: annotation.height } : {}),
      ...(notesLocked ? { draggable: false, selectable: false } : {}),
    })
  }
  const deviceNodes: WorkspaceDeviceNode[] = doc.state.devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: doc.layout.devices[device.id] ?? { x: 0, y: 0 },
    data: { device, modelName: labels.modelName(device), cableHighlight: input.cableHighlight(device.id) },
    selected: selection.deviceIds.includes(device.id),
    draggable: input.devicesDraggable,
    measured: measured[device.id],
    ariaLabel: labels.device(device),
    className: 'group',
  }))
  // Shapes first so they are drawn behind the devices.
  return [...annotationNodes, ...deviceNodes]
}

export function buildEdges(
  doc: LabDocument,
  selection: WorkspaceSelection,
  lightOf: (link: Link) => LinkLight,
  labels: FlowLabels,
): LinkFlowEdge[] {
  const devicesById = new Map(doc.state.devices.map((device) => [device.id, device]))
  const edges: LinkFlowEdge[] = []
  for (const link of doc.state.links) {
    const deviceA = devicesById.get(link.a.deviceId)
    const deviceB = devicesById.get(link.b.deviceId)
    if (!deviceA || !deviceB) {
      console.warn(`Link ${link.id} points to a missing device; it is not drawn.`)
      continue
    }
    edges.push({
      id: link.id,
      type: 'link',
      source: deviceA.id,
      target: deviceB.id,
      selected: selection.linkIds.includes(link.id),
      ariaLabel: labels.link(link, deviceA, deviceB),
      data: {
        link,
        light: lightOf(link),
        wireless: link.cable === 'wireless',
        switchEnds: [
          { side: 'source', portId: link.a.portId },
          { side: 'target', portId: link.b.portId },
        ],
      },
    })
  }
  return edges
}

/** Top-left point of a node as the document has it (device layout or annotation), or null. */
export function documentPosition(doc: LabDocument, nodeId: string): CanvasPoint | null {
  const annotationId = annotationIdOf(nodeId)
  if (annotationId === null) return doc.layout.devices[nodeId] ?? null
  const annotation = doc.annotations.find((candidate) => candidate.id === annotationId)
  return annotation ? annotationPosition(annotation) : null
}

/** Positions of nodes being dragged right now (by node id). */
export type DragPositions = Readonly<Record<string, CanvasPoint>>

/**
 * `nodes` with the nodes being dragged at their drag positions. Only those nodes get new objects, so
 * a drag frame costs one pass over the list and re-renders only the dragged nodes.
 */
export function withDragPositions(nodes: WorkspaceNode[], dragPositions: DragPositions): WorkspaceNode[] {
  if (Object.keys(dragPositions).length === 0) return nodes
  return nodes.map((node) => {
    const position = dragPositions[node.id]
    return position === undefined || shallowEqual(position, node.position) ? node : { ...node, position }
  })
}

/** Same own keys with identical values (one level deep). */
function shallowEqual(first: object, second: object): boolean {
  const firstEntries = Object.entries(first)
  if (firstEntries.length !== Object.keys(second).length) return false
  const secondRecord: Record<string, unknown> = { ...second }
  return firstEntries.every(([key, value]) => Object.hasOwn(secondRecord, key) && Object.is(value, secondRecord[key]))
}

/** Equal values, or two arrays whose items are shallowly equal (edge data's `switchEnds`). */
function sameValue(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false
  return first.every((item: unknown, index) => {
    const other: unknown = second[index]
    if (Object.is(item, other)) return true
    return typeof item === 'object' && item !== null && typeof other === 'object' && other !== null && shallowEqual(item, other)
  })
}

/** Same own keys; values equal by `sameValue`. */
function sameRecord(first: object, second: object): boolean {
  const firstEntries = Object.entries(first)
  if (firstEntries.length !== Object.keys(second).length) return false
  const secondRecord: Record<string, unknown> = { ...second }
  return firstEntries.every(([key, value]) => Object.hasOwn(secondRecord, key) && sameValue(value, secondRecord[key]))
}

/** Optional plain objects (position, measured size) equal by value. */
function samePlain(first: object | undefined, second: object | undefined): boolean {
  if (first === undefined || second === undefined) return first === second
  return shallowEqual(first, second)
}

/** The fields of nodes and edges the reuse compares. */
interface FlowElement {
  id: string
  data?: object
  position?: object
  measured?: object
}

/** Equal for React Flow: the same fields, with position, size and data compared by value. */
function sameElement(previous: FlowElement, next: FlowElement): boolean {
  const { position, measured, data, ...rest } = next
  const { position: previousPosition, measured: previousMeasured, data: previousData, ...previousRest } = previous
  if (!shallowEqual(rest, previousRest) || !samePlain(position, previousPosition) || !samePlain(measured, previousMeasured)) return false
  if (data === undefined || previousData === undefined) return data === previousData
  return sameRecord(data, previousData)
}

/**
 * `next` with every node or edge that did not change replaced by its previous object, so React Flow
 * and the memoised node and edge components re-render only what changed (a selection change: the
 * nodes and cables whose selection changed; a drag frame: the moved nodes).
 */
export function reuseUnchanged<Element extends FlowElement>(previousElements: readonly Element[], next: readonly Element[]): Element[] {
  const previous = new Map(previousElements.map((element) => [element.id, element]))
  return next.map((element) => {
    const before = previous.get(element.id)
    return before && sameElement(before, element) ? before : element
  })
}
