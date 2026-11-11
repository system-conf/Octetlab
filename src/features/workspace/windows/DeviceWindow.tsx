import { Minus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import { DeviceVisual, findDeviceModel } from '../labServices'
import { DeviceWindowManager, type WindowArea, type WindowRect } from './DeviceWindowManager'

interface DeviceWindowProps {
  device: Device
  rect: WindowRect
  minimised: boolean
  /** The front window: focus ring and strong title. */
  active: boolean
  zIndex: number
  /** The area the window must stay inside (null: not measured yet). */
  area: WindowArea | null
  onFocus: () => void
  onMinimise: () => void
  onClose: () => void
  onMove: (x: number, y: number) => void
  onResize: (width: number, height: number) => void
  /** The device's tabs (the same ones the properties panel shows). */
  children: ReactNode
}

interface Gesture {
  kind: 'move' | 'resize'
  startX: number
  startY: number
  from: WindowRect
}

/** Device icons in their category colour, as on the map. */
const ICON_TONE = 'category'

/** Diagonal lines of the resize grip (decorative). */
const GRIP_BACKGROUND =
  'linear-gradient(135deg, transparent 50%, var(--color-border-strong) 50%, var(--color-border-strong) 58%, transparent 58%, transparent 70%, var(--color-border-strong) 70%, var(--color-border-strong) 78%, transparent 78%)'

/**
 * One floating device window (Packet Tracer style): title bar with the device's icon, name and model,
 * minimise and close; the device tabs below; a resize grip in the corner. Drag the title bar to move
 * it (it stays inside the workspace), click it to bring it to the front, Escape closes it. A drag
 * shows on this window only and is handed to the window manager when the pointer is released.
 */
function DeviceWindow(props: DeviceWindowProps) {
  const { device, minimised, active, area } = props
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const titleId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const gesture = useRef<Gesture | null>(null)
  // The rectangle while the title bar or the grip is dragged (null: the manager's).
  const [live, setLive] = useState<{ kind: Gesture['kind']; rect: WindowRect } | null>(null)
  const liveRect = useRef<WindowRect | null>(null)
  const rect = live?.rect ?? props.rect
  const model = findDeviceModel(device.modelId)
  const modelName = model ? translate({ key: model.nameKey }) : device.modelId

  // Opened or restored from the dock: the keyboard focus moves into the window; when it closes or is
  // minimised with the focus inside, the focus goes back where it was (usually the device on the map).
  useEffect(() => {
    if (minimised) return undefined
    const root = rootRef.current
    const before = document.activeElement
    root?.focus({ preventScroll: true })
    return () => {
      const focused = document.activeElement
      const lost = focused === null || focused === document.body || root?.contains(focused) === true
      if (lost && before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [minimised])

  function showLive(kind: Gesture['kind'], next: WindowRect | null) {
    liveRect.current = next
    setLive(next === null ? null : { kind, rect: next })
  }

  function start(kind: Gesture['kind'], event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    if (kind === 'move' && event.target instanceof Element && event.target.closest('button')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { kind, startX: event.clientX, startY: event.clientY, from: rect }
  }

  function drag(event: PointerEvent<HTMLElement>) {
    const current = gesture.current
    if (current === null) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    const { from } = current
    showLive(
      current.kind,
      current.kind === 'move'
        ? DeviceWindowManager.moved(from, from.x + dx, from.y + dy, area)
        : DeviceWindowManager.resized(from, from.width + dx, from.height + dy, area),
    )
  }

  function finish() {
    const current = gesture.current
    const last = liveRect.current
    gesture.current = null
    if (current === null) return
    if (last !== null) {
      if (current.kind === 'move') props.onMove(last.x, last.y)
      else props.onResize(last.width, last.height)
    }
    showLive(current.kind, null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    props.onClose()
  }

  const gestureHandlers = { onPointerMove: drag, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish }

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      hidden={minimised}
      data-device-window={device.id}
      onPointerDownCapture={props.onFocus}
      onFocusCapture={active ? undefined : props.onFocus}
      onKeyDown={handleKeyDown}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: props.zIndex }}
      className={`pointer-events-auto absolute ${minimised ? 'hidden' : 'flex'} flex-col overflow-hidden rounded-xl border bg-surface outline-none ${
        active ? 'border-focus/60 shadow-2xl ring-3 ring-focus/15' : 'border-border-strong shadow-xl'
      }`}
    >
      <div
        onPointerDown={(event) => start('move', event)}
        {...gestureHandlers}
        className={`flex shrink-0 touch-none select-none items-center gap-2.5 border-b border-border bg-surface-subtle py-1.5 ps-2.5 pe-2 ${
          live?.kind === 'move' ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-muted" aria-hidden="true">
          <DeviceVisual kind={device.kind} modelId={device.modelId} tone={ICON_TONE} className="h-5 w-5" illustrationClassName="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 id={titleId} className={`truncate text-sm font-semibold ${active ? 'text-fg-strong' : 'text-fg-muted'}`}>
            {device.name}
          </h2>
          <span className="truncate rounded-md border border-border bg-surface-muted px-1.5 font-mono text-[11px] text-fg-subtle">{modelName}</span>
        </div>
        <button
          type="button"
          onClick={props.onMinimise}
          aria-label={t('windows.minimise', { name: device.name })}
          title={t('windows.minimiseShort')}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-strong hover:text-fg-strong ${focusRing}`}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={props.onClose}
          aria-label={t('windows.close', { name: device.name })}
          title={t('windows.closeShort')}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-rose-600 hover:text-white ${focusRing}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{props.children}</div>
      <div
        aria-hidden="true"
        onPointerDown={(event) => start('resize', event)}
        {...gestureHandlers}
        style={{ background: GRIP_BACKGROUND }}
        className="absolute right-0.5 bottom-0.5 h-4 w-4 cursor-nwse-resize touch-none"
      />
    </section>
  )
}

export default DeviceWindow
