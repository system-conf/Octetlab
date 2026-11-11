import { useId, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import CablePalette from './CablePalette'
import ModelDetailCard from './ModelDetailCard'
import ModelTileGrid from './ModelTileGrid'
import { PaletteSectionBar, SubcategoryTabs } from './PaletteNavigation'
import PaletteSearchField from './PaletteSearchField'
import type { PaletteProps } from './paletteProps'
import { usePaletteViewName } from './paletteViews'
import { usePaletteEmptyText } from './usePaletteEmptyText'
import { useDevicePalette } from './useDevicePalette'

/** A mouse wheel scrolls the tile row sideways (the row never scrolls up and down). */
function scrollSideways(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
}

/**
 * The device palette as a strip under the canvas (Preferences → Appearance → device list "at the
 * bottom", like Packet Tracer): categories and search on the left, the chosen category's tiles in
 * one sideways-scrolling row, the details card on the right. Same state and tiles as the sidebar.
 */
function DevicePaletteBar({ models, onAdd, onChooseCable, activeCable, priceLabelOf }: PaletteProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const viewName = usePaletteViewName()
  const palette = useDevicePalette(models, onAdd)
  const { memory, texts, view, searching, resultCount, highlightId } = palette
  const emptyText = usePaletteEmptyText(palette)
  const titleId = useId()
  const headingId = useId()
  const cables = !searching && view === 'cables'

  return (
    <section aria-labelledby={titleId} className="flex h-40 shrink-0 border-t border-border bg-surface" data-palette-layout="bottomBar">
      <h2 id={titleId} className="sr-only">
        {t('palette.title')}
      </h2>
      <div className="flex w-64 shrink-0 flex-col justify-between gap-1.5 border-e border-border p-2">
        <PaletteSectionBar views={palette.views} current={searching ? null : view} onSelect={palette.selectView} labelled />
        <PaletteSearchField query={palette.query} onQuery={palette.setQuery} compact />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2 ps-3 pe-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={headingId} className="shrink-0 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {searching ? t('palette.resultCount', { count: resultCount }) : viewName(view)}
          </h3>
          {!searching && palette.subcategories.length > 1 && (
            <SubcategoryTabs subcategories={palette.subcategories} current={palette.subcategory} onSelect={palette.setSubcategory} singleLine />
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {searching ? t('palette.resultCount', { count: resultCount }) : ''}
        </p>
        <div onWheel={scrollSideways} className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden">
          {cables ? (
            <CablePalette activeTool={activeCable} onChoose={onChooseCable} row />
          ) : resultCount === 0 ? (
            <p className="self-center text-xs text-fg-subtle">{emptyText}</p>
          ) : (
            palette.tileGroups.map((group) => (
              <section
                key={group.key}
                aria-labelledby={group.subcategory === undefined ? headingId : `${headingId}-${group.key}`}
                className="flex shrink-0 flex-col border-border not-first:border-s not-first:ps-3"
              >
                {group.subcategory !== undefined && (
                  <h4 id={`${headingId}-${group.key}`} className="shrink-0 truncate text-[10px] leading-4 font-medium text-fg-subtle">
                    {translate({ key: `catalog:subcategories.${group.subcategory}` })}
                  </h4>
                )}
                <ModelTileGrid
                  models={group.models}
                  textOf={texts.textOf}
                  favourites={memory.favourites}
                  onAdd={palette.add}
                  onDropped={memory.recordUse}
                  onHighlight={palette.setHighlightId}
                  priceLabelOf={priceLabelOf}
                  row
                />
              </section>
            ))
          )}
        </div>
        {!cables && <p className="sr-only">{t('palette.gridHint')}</p>}
      </div>
      {!cables && (
        <div className="w-48 shrink-0 xl:w-60">
          <ModelDetailCard
            model={palette.highlighted}
            text={highlightId === null ? undefined : texts.textOf(highlightId)}
            favourite={highlightId !== null && memory.favourites.includes(highlightId)}
            onToggleFavourite={memory.toggleFavourite}
            price={highlightId === null ? undefined : priceLabelOf?.(highlightId)}
            beside
          />
        </div>
      )}
    </section>
  )
}

export default DevicePaletteBar
