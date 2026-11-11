import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasPoint, LabDocument } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { usePreference } from '../../../preferences'
import { useMapAriaLabels } from './mapLabels'
import { findDeviceModel } from '../labServices'
import type { NodeMove } from '../WorkspaceOperations'
import { MoveSnapper } from '../geometry/MoveSnapper'
import { GRID_SIZE, MODEL_DRAG_TYPE, NUDGE_STEP } from '../workspaceConstants'
import AnnotationNodeView from './AnnotationNodeView'
import type { CableHighlight, LinkFlowEdge, WorkspaceNode, WorkspaceSelection } from './canvasTypes'
import { annotationText, documentPosition, type DragPositions, type FlowLabels, type MeasuredSizes } from './flowElements'
import { SelectionModel } from './SelectionModel'
import { useCanvasElements } from './useCanvasElements'
import { useViewportMotion } from './useViewportMotion'
import WorkspaceDeviceNode from './WorkspaceDeviceNode'
import WorkspaceLinkEdge from './WorkspaceLinkEdge'

interface WorkspaceCanvasProps {
  doc: LabDocument
  selection: WorkspaceSelection
  onSelectionChange: (update: (selection: WorkspaceSelection) => WorkspaceSelection) => void
  /** Finished drags and keyboard moves; same `coalesceKey` in a row = one undo step. */
  onCommitMoves: (moves: readonly NodeMove[], coalesceKey?: string) => void
  /** A palette model was dropped at `point` (flow coordinates). */
  onDropModel: (modelId: string, point: CanvasPoint) => void
  onDeviceClick: (deviceId: string) => void
  /** A device was double-clicked (window mode opens its window); absent: nothing happens. */
  onDeviceOpen?: (deviceId: string) => void
  cableActive: boolean
  cableHighlight: (deviceId: string) => CableHighlight
  /** Finished drags land on the grid (the drag itself stays free); arrow keys move by grid steps. */
  snapToGrid: boolean
  /** false: devices cannot be dragged (exercise with a locked topology). */
  devicesDraggable: boolean
  screenToFlow: (point: CanvasPoint) => CanvasPoint
  canvasRef: RefObject<HTMLDivElement | null>
  /** Fit the view again when the canvas changes size, unless the learner moved it (exercise screen). */
  refitOnResize?: boolean
  /** Overlays inside the flow (cable hint, port picker). */
  children?: ReactNode
}

const nodeTypes = { device: WorkspaceDeviceNode, annotation: AnnotationNodeView }
const edgeTypes = { link: WorkspaceLinkEdge }
const moveSnapper = new MoveSnapper(GRID_SIZE, NUDGE_STEP)
const fitViewOptions = { padding: 0.3, maxZoom: 1.25 }
const selectionKey = 'Shift'
const multiSelectionKeys = ['Shift', 'Meta', 'Control']
const NO_DRAG: DragPositions = {}
/** From this many nodes on, only nodes and cables inside the view are mounted (docs/CANVAS_PERFORMANCE.md). */
const VISIBLE_ONLY_FROM = 200

/** The lab canvas (React Flow, controlled): devices, cables, notes; drop target of the palette. */
function WorkspaceCanvas({
  doc,
  selection,
  onSelectionChange,
  onCommitMoves,
  onDropModel,
  onDeviceClick,
  onDeviceOpen,
  cableActive,
  cableHighlight,
  snapToGrid,
  devicesDraggable,
  screenToFlow,
  canvasRef,
  refitOnResize = false,
  children,
}: WorkspaceCanvasProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const ariaLabels = useMapAriaLabels()
  const [measured, setMeasured] = useState<MeasuredSizes>({})
  const [dragPositions, setDragPositions] = useState<DragPositions>(NO_DRAG)
  const motion = useViewportMotion(canvasRef, refitOnResize, fitViewOptions)
  // PU (Preferences → Map): dot grid and minimap.
  const [showGrid] = usePreference('map.grid')
  const [showMinimap] = usePreference('map.minimap')
  // The handlers below stay the same functions for the whole life of the canvas (a new handler would
  // re-render every node wrapper of React Flow); they read the latest props from here.
  const latest = useRef({ doc, snapToGrid, onCommitMoves, onSelectionChange, onDeviceClick, onDeviceOpen })
  useLayoutEffect(() => {
    latest.current = { doc, snapToGrid, onCommitMoves, onSelectionChange, onDeviceClick, onDeviceOpen }
  })
  /** Nodes being dragged (a position change without `dragging` after them ends a drag). */
  const draggingIds = useRef(new Set<string>())

  const labels = useMemo<FlowLabels>(
    () => ({
      device: (device) => (device.powered ? device.name : t('canvas.deviceOff', { name: device.name })),
      modelName: (device) => {
        const model = findDeviceModel(device.modelId)
        return model ? translate({ key: model.nameKey }) : device.modelId
      },
      annotation: (annotation) =>
        t('annotation.label', { text: annotationText(annotation) }),
      link: (link, a, b) => t('canvas.link', { cable: t(`cableTools.${link.cable}`), a: a.name, b: b.name }),
    }),
    [t, translate],
  )

  // Unchanged nodes and cables keep their objects: only what changed re-renders.
  const { nodes, edges } = useCanvasElements({ doc, selection, dragPositions, measured, labels, cableHighlight, devicesDraggable })
  const dragActive = dragPositions !== NO_DRAG

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkspaceNode>[]) => {
      const { doc: current, snapToGrid: snap, onCommitMoves: commit, onSelectionChange: select } = latest.current
      const sizes: Record<string, { width: number; height: number }> = {}
      const dragging: Record<string, CanvasPoint> = {}
      const finished: NodeMove[] = []
      let fromKeyboard = false
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) sizes[change.id] = change.dimensions
        else if (change.type === 'select') select((selection) => SelectionModel.node(selection, change.id, change.selected))
        else if (change.type === 'position' && change.position) {
          if (change.dragging) {
            dragging[change.id] = change.position
            draggingIds.current.add(change.id)
          } else if (draggingIds.current.delete(change.id)) {
            finished.push({ nodeId: change.id, to: moveSnapper.dragEnd(change.position, snap) })
          } else {
            // Arrow keys on a focused node move it without a drag before.
            fromKeyboard = true
            const from = documentPosition(current, change.id) ?? change.position
            finished.push({ nodeId: change.id, to: moveSnapper.keyMove(from, change.position, snap) })
          }
        }
      }
      if (Object.keys(sizes).length > 0) setMeasured((known) => ({ ...known, ...sizes }))
      if (Object.keys(dragging).length > 0) setDragPositions((positions) => ({ ...positions, ...dragging }))
      if (finished.length > 0) {
        const ids = finished.map((move) => move.nodeId)
        commit(finished, fromKeyboard ? `nudge:${ids.join(',')}` : undefined)
        setDragPositions((positions) => {
          const left = Object.entries(positions).filter(([id]) => !ids.includes(id))
          return left.length === 0 ? NO_DRAG : Object.fromEntries(left)
        })
      }
    },
    [],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<LinkFlowEdge>[]) => {
      for (const change of changes) {
        if (change.type === 'select') latest.current.onSelectionChange((selection) => SelectionModel.link(selection, change.id, change.selected))
      }
    },
    [],
  )

  const handleNodeClick = useCallback<NodeMouseHandler<WorkspaceNode>>((_event, node) => {
    if (node.type === 'device') latest.current.onDeviceClick(node.id)
  }, [])

  const handleNodeDoubleClick = useCallback<NodeMouseHandler<WorkspaceNode>>((_event, node) => {
    if (node.type === 'device') latest.current.onDeviceOpen?.(node.id)
  }, [])

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MODEL_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const modelId = event.dataTransfer.getData(MODEL_DRAG_TYPE)
    if (modelId === '') return
    event.preventDefault()
    onDropModel(modelId, screenToFlow({ x: event.clientX, y: event.clientY }))
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      // `data-moving` while devices are dragged: cheaper node styles (no shadows), no minimap.
      data-moving={dragActive ? '' : undefined}
      className={`group/canvas relative h-full w-full bg-canvas ${cableActive ? '[&_.react-flow__node-device]:cursor-crosshair' : ''}`}
      role="group"
      aria-label={t('canvas.label')}
    >
      <ReactFlow<WorkspaceNode, LinkFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onMoveStart={motion.onMoveStart}
        onMoveEnd={motion.onMoveEnd}
        onlyRenderVisibleElements={nodes.length >= VISIBLE_ONLY_FROM}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        maxZoom={2.5}
        nodesConnectable={false}
        elementsSelectable={!cableActive}
        deleteKeyCode={null}
        selectionKeyCode={selectionKey}
        multiSelectionKeyCode={multiSelectionKeys}
        zoomOnDoubleClick={false}
        ariaLabelConfig={ariaLabels}
      >
        {showGrid && <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1.5} color="var(--color-canvas-grid)" />}
        {/* Hidden while cabling (the port picker opens beside devices and must not sit under it) and while
            devices are dragged (it would redraw every node each frame). */}
        {showMinimap && !cableActive && !dragActive && (
          <MiniMap className="hidden md:block" position="bottom-right" pannable zoomable nodeColor="var(--color-border-strong)" nodeStrokeColor="var(--color-fg-subtle)" />
        )}
        {children}
      </ReactFlow>
      {doc.state.devices.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto max-w-xs px-4 text-center text-sm text-fg-subtle">
          {t('canvas.empty')}
        </p>
      )}
    </div>
  )
}

export default WorkspaceCanvas
