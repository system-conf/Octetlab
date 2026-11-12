import { useMemo, useState } from 'react'
import type { LabDocument } from '../../../domain'
import { linkLightOf } from '../labServices'
import type { CableHighlight, LinkFlowEdge, WorkspaceNode, WorkspaceSelection } from './canvasTypes'
import { buildEdges, buildNodes, reuseUnchanged, withDragPositions, type DragPositions, type FlowLabels, type MeasuredSizes } from './flowElements'

export interface CanvasElementsInput {
  doc: LabDocument
  selection: WorkspaceSelection
  dragPositions: DragPositions
  measured: MeasuredSizes
  labels: FlowLabels
  cableHighlight: (deviceId: string) => CableHighlight
  devicesDraggable: boolean
  /** Read-only live lab: notes are neither selectable nor draggable. */
  annotationsLocked?: boolean
}

export interface CanvasElements {
  nodes: WorkspaceNode[]
  edges: LinkFlowEdge[]
}

/**
 * `next` with the unchanged elements of the previous list (React's "adjusting state while rendering"
 * pattern: the kept list follows `next`, the previous objects survive).
 */
function useKept<Element extends { id: string }>(next: Element[], reuse: (previous: readonly Element[], next: readonly Element[]) => Element[]): Element[] {
  const [kept, setKept] = useState<{ next: Element[]; elements: Element[] }>(() => ({ next, elements: next }))
  if (kept.next === next) return kept.elements
  const elements = reuse(kept.elements, next)
  setKept({ next, elements })
  return elements
}

/**
 * React Flow nodes and edges of the lab with stable objects (docs/CANVAS_PERFORMANCE.md): a node or
 * cable keeps its object while nothing about it changed, so a selection change re-renders only the
 * elements whose selection changed and a drag frame only the dragged nodes (drag positions are laid
 * over the built nodes without rebuilding them).
 */
export function useCanvasElements(input: CanvasElementsInput): CanvasElements {
  const { doc, selection, dragPositions, measured, labels, cableHighlight, devicesDraggable, annotationsLocked } = input
  const builtNodes = useMemo(
    () => buildNodes({ doc, selection, measured, labels, cableHighlight, devicesDraggable, annotationsLocked }),
    [annotationsLocked, cableHighlight, devicesDraggable, doc, labels, measured, selection],
  )
  const builtEdges = useMemo(() => buildEdges(doc, selection, (link) => linkLightOf(doc.state, link.id), labels), [doc, labels, selection])
  const keptNodes = useKept(builtNodes, reuseUnchanged)
  const edges = useKept(builtEdges, reuseUnchanged)
  const nodes = useMemo(() => withDragPositions(keptNodes, dragPositions), [dragPositions, keptNodes])
  return { nodes, edges }
}
