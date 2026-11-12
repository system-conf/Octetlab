import { useReactFlow, useStoreApi } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import type { LabDocument } from '../../domain'
import { usePrefersReducedMotion } from '../shared/usePrefersReducedMotion'
import { LiveViewportRule } from './model/LiveViewportRule'

const FIT_OPTIONS = { padding: 0.3, maxZoom: 1.25 }
const FIT_DURATION_MS = 300

/**
 * Keeps the viewer's pan and zoom while the lab changes; fits the map again only when the first
 * devices appear or a new device lands outside the view (LiveViewportRule). The first document is
 * fitted by WorkspaceView itself. Must run inside the ReactFlowProvider of the canvas.
 */
export function useLiveViewport(doc: LabDocument): void {
  const flow = useReactFlow()
  const store = useStoreApi()
  const reducedMotion = usePrefersReducedMotion()
  const shown = useRef<LabDocument | null>(null)

  useEffect(() => {
    const previous = shown.current
    shown.current = doc
    const { width, height } = store.getState()
    const visible = LiveViewportRule.visibleRect(flow.getViewport(), width, height)
    if (!LiveViewportRule.shouldRefit(previous, doc, visible)) return
    // Two frames: React Flow measures the new nodes first, then the view fits all of them.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void flow.fitView({ ...FIT_OPTIONS, duration: reducedMotion ? 0 : FIT_DURATION_MS }))
    })
    return () => cancelAnimationFrame(frame)
  }, [doc, flow, reducedMotion, store])
}
