// State of one mounted device palette (sidebar, bottom bar or phone drawer): current view,
// sub-category filter, search, highlighted model, favourites / recent and the tiles to show.
import { useMemo, useState } from 'react'
import type { DeviceModel, DeviceSubcategory } from '../../../domain'
import { PaletteContents, type TileGroup } from './PaletteContents'
import type { PaletteView, SubcategoryChoice } from './paletteViews'
import { usePaletteMemory, type PaletteMemoryControls } from './usePaletteMemory'
import { usePaletteTexts, type PaletteTexts } from './usePaletteTexts'

export interface DevicePaletteState {
  memory: PaletteMemoryControls
  texts: PaletteTexts
  views: readonly PaletteView[]
  view: PaletteView
  /** Shows a view; clears the sub-category filter and the search. */
  selectView: (view: PaletteView) => void
  subcategories: readonly DeviceSubcategory[]
  subcategory: SubcategoryChoice
  setSubcategory: (choice: SubcategoryChoice) => void
  query: string
  setQuery: (query: string) => void
  searching: boolean
  tileGroups: readonly TileGroup[]
  resultCount: number
  highlightId: string | null
  setHighlightId: (modelId: string | null) => void
  highlighted: DeviceModel | null
  /** Click / Enter on a tile: remembered as recent, then added to the canvas. */
  add: (modelId: string) => void
}

export function useDevicePalette(models: readonly DeviceModel[], onAdd: (modelId: string) => void): DevicePaletteState {
  const memory = usePaletteMemory()
  const texts = usePaletteTexts(models)
  const [view, setView] = useState<PaletteView>('network')
  const [subcategory, setSubcategory] = useState<SubcategoryChoice>('all')
  const [query, setQuery] = useState('')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const searching = query.trim().length > 0

  const contents = useMemo(() => new PaletteContents(models), [models])
  const views = useMemo(() => contents.views(), [contents])
  const tileGroups = contents.groups({
    view,
    subcategory,
    searchResults: searching ? texts.filter.search(query) : null,
    favourites: memory.favourites,
    recent: memory.recent,
  })

  function selectView(next: PaletteView) {
    setView(next)
    setSubcategory('all')
    setQuery('')
  }

  function add(modelId: string) {
    memory.recordUse(modelId)
    onAdd(modelId)
  }

  return {
    memory,
    texts,
    views,
    view,
    selectView,
    subcategories: contents.subcategories(view),
    subcategory,
    setSubcategory,
    query,
    setQuery,
    searching,
    tileGroups,
    resultCount: PaletteContents.count(tileGroups),
    highlightId,
    setHighlightId,
    highlighted: highlightId === null ? null : contents.model(highlightId),
    add,
  }
}
