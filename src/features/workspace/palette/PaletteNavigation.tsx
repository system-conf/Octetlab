import { Boxes, Cable, Cpu, History, MonitorSmartphone, Network, Star, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeviceSubcategory } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import { usePaletteViewName, type PaletteView, type SubcategoryChoice } from './paletteViews'

const VIEW_ICONS: Readonly<Record<PaletteView, LucideIcon>> = {
  network: Network,
  endDevices: MonitorSmartphone,
  iot: Cpu,
  misc: Boxes,
  cables: Cable,
  favourites: Star,
  recent: History,
}

const PRESSED = 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 ring-1 ring-sky-300 dark:ring-sky-700'

interface PaletteSectionBarProps {
  views: readonly PaletteView[]
  /** null while a search shows results from every section. */
  current: PaletteView | null
  onSelect: (view: PaletteView) => void
  /** Bottom bar: one row of equal cells, an icon with a short name under each (default: a row of icons only). */
  labelled?: boolean
}

/** Top level of the palette: one icon button per section, plus cables, favourites and recent. */
export function PaletteSectionBar({ views, current, onSelect, labelled = false }: PaletteSectionBarProps) {
  const { t } = useTranslation('workspace')
  const nameOf = usePaletteViewName()
  return (
    <div
      role="group"
      aria-label={t('palette.sectionsLabel')}
      className={labelled ? 'grid auto-cols-fr grid-flow-col gap-0.5' : 'flex flex-wrap justify-between gap-0.5'}
    >
      {views.map((view) => {
        const Icon = VIEW_ICONS[view]
        const pressed = view === current
        const name = nameOf(view)
        return (
          <button
            key={view}
            type="button"
            onClick={() => onSelect(view)}
            aria-pressed={pressed}
            aria-label={name}
            title={name}
            className={`flex ${labelled ? 'h-10 min-w-0 flex-col gap-0.5 px-0.5' : 'h-8 w-8'} items-center justify-center rounded-md transition ${
              pressed ? PRESSED : 'text-fg-muted hover:bg-surface-muted'
            } ${focusRing}`}
          >
            <Icon className={labelled ? 'h-4 w-4 shrink-0' : 'h-5 w-5'} aria-hidden="true" />
            {labelled && <span className="max-w-full truncate text-[10px] leading-tight">{t(`palette.shortSections.${view}`)}</span>}
          </button>
        )
      })}
    </div>
  )
}

interface SubcategoryTabsProps {
  subcategories: readonly DeviceSubcategory[]
  current: SubcategoryChoice
  onSelect: (choice: SubcategoryChoice) => void
  /** Bottom bar: one line that scrolls sideways (default: wraps onto more lines). */
  singleLine?: boolean
}

/** Second level: "All" plus the section's sub-categories that have models. */
export function SubcategoryTabs({ subcategories, current, onSelect, singleLine = false }: SubcategoryTabsProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const choices: readonly SubcategoryChoice[] = ['all', ...subcategories]
  return (
    <div
      role="group"
      aria-label={t('palette.subcategoriesLabel')}
      className={singleLine ? 'flex min-w-0 gap-1 overflow-x-auto' : 'flex flex-wrap gap-1'}
    >
      {choices.map((choice) => {
        const pressed = choice === current
        return (
          <button
            key={choice}
            type="button"
            onClick={() => onSelect(choice)}
            aria-pressed={pressed}
            className={`${singleLine ? 'shrink-0 whitespace-nowrap ' : ''}rounded-full border px-2 py-0.5 text-xs ${
              pressed ? 'border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200' : 'border-border text-fg-muted hover:bg-surface-muted'
            } ${focusRing}`}
          >
            {choice === 'all' ? t('palette.all') : translate({ key: `catalog:subcategories.${choice}` })}
          </button>
        )
      })}
    </div>
  )
}
