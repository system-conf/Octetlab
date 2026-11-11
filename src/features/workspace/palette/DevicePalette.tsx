import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import CablePalette from './CablePalette'
import ModelDetailCard from './ModelDetailCard'
import ModelTileGrid from './ModelTileGrid'
import { PaletteSectionBar, SubcategoryTabs } from './PaletteNavigation'
import PaletteSearchField from './PaletteSearchField'
import type { PaletteProps } from './paletteProps'
import { usePaletteEmptyText } from './usePaletteEmptyText'
import { useDevicePalette } from './useDevicePalette'
import { usePaletteViewName } from './paletteViews'

/**
 * Device palette in two levels: section bar (network devices, end devices, cables, favourites,
 * recent) → sub-category filter → model tiles, with search and a details card. Drag a tile onto
 * the canvas or click it.
 */
function DevicePalette({ models, onAdd, onChooseCable, activeCable, priceLabelOf }: PaletteProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const viewName = usePaletteViewName()
  const palette = useDevicePalette(models, onAdd)
  const { memory, texts, view, searching, query, resultCount, highlightId } = palette
  const emptyText = usePaletteEmptyText(palette)
  const headingId = useId()

  return (
    <div className="flex flex-col gap-2">
      <PaletteSectionBar views={palette.views} current={searching ? null : view} onSelect={palette.selectView} />
      <PaletteSearchField query={query} onQuery={palette.setQuery} />
      <h3 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {searching ? t('palette.resultCount', { count: resultCount }) : viewName(view)}
      </h3>
      <p className="sr-only" aria-live="polite">
        {searching ? t('palette.resultCount', { count: resultCount }) : ''}
      </p>
      {!searching && palette.subcategories.length > 1 && (
        <SubcategoryTabs subcategories={palette.subcategories} current={palette.subcategory} onSelect={palette.setSubcategory} />
      )}
      {!searching && view === 'cables' ? (
        <CablePalette activeTool={activeCable} onChoose={onChooseCable} />
      ) : (
        <>
          <p className="text-xs text-fg-subtle">{t('palette.hint')}</p>
          <p className="hidden text-xs text-fg-subtle pointer-coarse:block">{t('palette.touchHint')}</p>
          {resultCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-fg-subtle">{emptyText}</p>
          ) : (
            palette.tileGroups.map((group) => (
              <section key={group.key} aria-labelledby={group.subcategory === undefined ? headingId : `${headingId}-${group.key}`}>
                {group.subcategory !== undefined && (
                  <h4 id={`${headingId}-${group.key}`} className="mb-1 text-xs font-medium text-fg-subtle">
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
                />
              </section>
            ))
          )}
          <p className="sr-only">{t('palette.gridHint')}</p>
          <ModelDetailCard
            model={palette.highlighted}
            text={highlightId === null ? undefined : texts.textOf(highlightId)}
            favourite={highlightId !== null && memory.favourites.includes(highlightId)}
            onToggleFavourite={memory.toggleFavourite}
            price={highlightId === null ? undefined : priceLabelOf?.(highlightId)}
          />
        </>
      )}
    </div>
  )
}

export default DevicePalette
