import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'

interface PaletteSearchFieldProps {
  query: string
  onQuery: (query: string) => void
  /** Smaller text and padding (bottom bar). */
  compact?: boolean
}

/** Search box of the device palette with a clear button; Escape clears it before reaching the workspace. */
function PaletteSearchField({ query, onQuery, compact = false }: PaletteSearchFieldProps) {
  const { t } = useTranslation('workspace')
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || query === '') return
          // Clears the search first; a second Escape reaches the drawer / workspace.
          event.preventDefault()
          event.stopPropagation()
          onQuery('')
        }}
        aria-label={t('palette.search')}
        placeholder={t('palette.searchPlaceholder')}
        className={`w-full rounded-md border border-border-strong bg-surface ${compact ? 'py-1 text-xs' : 'py-1.5 text-sm'} ps-8 pe-8 text-fg-strong placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden ${focusRing}`}
      />
      {query !== '' && (
        <button
          type="button"
          onClick={() => onQuery('')}
          aria-label={t('palette.clearSearch')}
          className={`absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg ${focusRing}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default PaletteSearchField
