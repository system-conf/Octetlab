import { useTranslation } from 'react-i18next'
import type { DevicePaletteState } from './useDevicePalette'

/** Text shown instead of tiles when a search, the favourites or the recent list is empty. */
export function usePaletteEmptyText({ searching, query, view }: Pick<DevicePaletteState, 'searching' | 'query' | 'view'>): string {
  const { t } = useTranslation('workspace')
  if (searching) return t('palette.noResults', { query: query.trim() })
  return view === 'favourites' ? t('palette.emptyFavourites') : t('palette.emptyRecent')
}
