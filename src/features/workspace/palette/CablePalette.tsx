import { useTranslation } from 'react-i18next'
import type { CableTool } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import CableGlyph from '../cable/CableGlyph'
import { useOfferedCableTools } from '../cable/useOfferedCableTools'

interface CablePaletteProps {
  activeTool: CableTool | null
  onChoose: (tool: CableTool) => void
  /** Compact tiles in one line with the "when to use" line as a tooltip (bottom bar) instead of the list. */
  row?: boolean
}

/** The cable tools as a palette list with a line on when to use each (the toolbar stays a shortcut). */
function CablePalette({ activeTool, onChoose, row = false }: CablePaletteProps) {
  const { t } = useTranslation('workspace')
  const cableTools = useOfferedCableTools()
  return (
    <div className={row ? undefined : 'space-y-2'}>
      <p className={row ? 'sr-only' : 'text-xs text-fg-subtle'}>{t('palette.cableHint')}</p>
      <ul className={row ? 'flex gap-1' : 'space-y-1'}>
        {cableTools.map((tool) => {
          const name = t(`cableTools.${tool}`)
          const description = t(`palette.cableDescriptions.${tool}`)
          const pressed = activeTool === tool
          return (
            <li key={tool} className={row ? 'w-24 shrink-0' : undefined}>
              <button
                type="button"
                onClick={() => onChoose(tool)}
                aria-pressed={pressed}
                aria-label={t('palette.useCable', { name })}
                title={row ? `${name}\n${description}` : undefined}
                className={`flex w-full rounded-lg border p-2 text-xs ${row ? 'h-full flex-col items-center gap-1 text-center leading-tight' : 'items-start gap-2 text-start'} ${
                  pressed ? 'border-sky-300 dark:border-sky-700 bg-accent-muted' : 'border-transparent hover:border-sky-200 dark:hover:border-sky-800 hover:bg-accent-muted'
                } ${focusRing}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-fg">
                  <CableGlyph tool={tool} />
                </span>
                {row ? (
                  <span className="line-clamp-2 font-medium text-fg">{name}</span>
                ) : (
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{name}</span>
                    <span className="block text-fg-subtle">{description}</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default CablePalette
