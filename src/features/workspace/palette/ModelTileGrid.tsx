import { Star } from 'lucide-react'
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { DeviceKindIcon, DeviceVisual, useDeviceStyle } from '../labServices'
import { MODEL_DRAG_TYPE } from '../workspaceConstants'
import { GridNavigation, isGridKey } from './GridNavigation'
import { useLongPress } from './useLongPress'
import type { PaletteModelText } from './usePaletteTexts'

interface ModelTileGridProps {
  models: readonly DeviceModel[]
  textOf: (modelId: string) => PaletteModelText | undefined
  favourites: readonly string[]
  /** Click / Enter: add the model in the middle of the canvas. */
  onAdd: (modelId: string) => void
  /** The model was dropped on the canvas (drag ended with a copy). */
  onDropped: (modelId: string) => void
  /** Pointer, keyboard focus or a touch long-press is on this model (shown in the details card). */
  onHighlight: (modelId: string) => void
  /** Design (D2): price text under the name (design brief with a budget). */
  priceLabelOf?: (modelId: string) => string | undefined
  /** One horizontal row (bottom bar; tiles carry a tooltip) instead of the grid (sidebar, drawer). */
  row?: boolean
}

/** Number of columns the grid is laid out in right now (from the computed CSS grid). */
function columnsOf(list: HTMLElement | null): number {
  if (list === null) return 1
  return getComputedStyle(list).gridTemplateColumns.split(' ').filter((track) => track.length > 0).length
}

/**
 * Model tiles: drag one onto the canvas or click it. One tab stop per grid (roving focus); arrow
 * keys move between tiles, Home / End jump, Enter / Space add the focused model. On touch screens a
 * tap adds the model and a long-press shows its details card instead.
 */
function ModelTileGrid({ models, textOf, favourites, onAdd, onDropped, onHighlight, priceLabelOf, row = false }: ModelTileGridProps) {
  const { t } = useTranslation('workspace')
  const listRef = useRef<HTMLUListElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const describedByPrefix = useId()
  const current = Math.min(focusIndex, Math.max(0, models.length - 1))
  const longPress = useLongPress(onHighlight)
  const deviceStyle = useDeviceStyle()

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (!isGridKey(event.key)) return
    event.preventDefault()
    const rtl = listRef.current !== null && getComputedStyle(listRef.current).direction === 'rtl'
    // A row is one line of tiles: every tile is a column (Up / Down stay put).
    const columns = row ? models.length : columnsOf(listRef.current)
    const next = GridNavigation.next(current, event.key, models.length, columns, rtl)
    setFocusIndex(next)
    listRef.current?.querySelectorAll<HTMLButtonElement>('[data-palette-tile]')[next]?.focus()
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, modelId: string) {
    event.dataTransfer.setData(MODEL_DRAG_TYPE, modelId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleDragEnd(event: DragEvent<HTMLButtonElement>, modelId: string) {
    if (event.dataTransfer.dropEffect !== 'none') onDropped(modelId)
  }

  return (
    <ul ref={listRef} onKeyDown={handleKeyDown} className={row ? 'flex gap-1' : 'grid grid-cols-3 gap-1 md:grid-cols-2'}>
      {models.map((model, index) => {
        const text = textOf(model.id)
        const name = text?.name ?? model.id
        const favourite = favourites.includes(model.id)
        const describedBy = `${describedByPrefix}-${model.id}`
        const price = priceLabelOf?.(model.id)
        return (
          <li key={model.id} className={row ? 'relative w-20 shrink-0' : 'relative'}>
            <button
              type="button"
              data-palette-tile
              draggable
              tabIndex={index === current ? 0 : -1}
              onDragStart={(event) => handleDragStart(event, model.id)}
              onDragEnd={(event) => handleDragEnd(event, model.id)}
              {...longPress.handlersFor(model.id)}
              onClick={() => {
                if (!longPress.consumeClick()) onAdd(model.id)
              }}
              onFocus={() => {
                setFocusIndex(index)
                onHighlight(model.id)
              }}
              onMouseEnter={() => onHighlight(model.id)}
              aria-label={t('palette.add', { name })}
              aria-describedby={describedBy}
              title={row && text !== undefined ? `${name}\n${text.ports}` : undefined}
              className={`flex h-full w-full cursor-grab flex-col items-center gap-1 rounded-lg border border-transparent ${row ? 'p-1.5' : 'p-2'} text-center text-xs leading-tight text-fg select-none [-webkit-touch-callout:none] hover:border-sky-200 dark:hover:border-sky-800 hover:bg-accent-muted active:cursor-grabbing ${focusRing}`}
            >
              {deviceStyle === 'simple' ? (
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface shadow-sm">
                  <DeviceKindIcon kind={model.kind} modelId={model.id} className="h-8 w-8" aria-hidden="true" />
                </span>
              ) : (
                <DeviceVisual kind={model.kind} modelId={model.id} deviceStyle={deviceStyle} illustrationClassName="h-11 w-11" aria-hidden="true" />
              )}
              <span className="line-clamp-2">{name}</span>
              {/* Design (D2): price of the model in a brief with a budget */}
              {price !== undefined && (
                <span aria-hidden="true" className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1 text-[10px] font-medium text-indigo-800 dark:text-indigo-200">
                  {price}
                </span>
              )}
              <span id={describedBy} className="sr-only">
                {favourite && <span>{t('palette.isFavourite')}. </span>}
                {text?.ports}
                {price !== undefined && <span>, {price}</span>}
              </span>
            </button>
            {favourite && (
              <Star className="pointer-events-none absolute end-1 top-1 h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default ModelTileGrid
