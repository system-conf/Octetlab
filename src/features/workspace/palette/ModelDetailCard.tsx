import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { DeviceVisual } from '../labServices'
import type { PaletteModelText } from './usePaletteTexts'

interface ModelDetailCardProps {
  /** The hovered / focused model; null before the first one. */
  model: DeviceModel | null
  text: PaletteModelText | undefined
  favourite: boolean
  onToggleFavourite: (modelId: string) => void
  /** Design (D2): price text (design brief with a budget). */
  price?: string
  /** A scrolling column at the end of the bottom bar, instead of sticking to the bottom of a scrolling palette. */
  beside?: boolean
}

const STICKY = 'sticky bottom-0 -mx-3 -mb-3 border-t bg-surface/95 backdrop-blur'
const BESIDE = 'h-full overflow-y-auto border-s bg-surface'

/**
 * Details of the model under the pointer or keyboard focus: port summary, short description,
 * "when to use it" and the favourite star. Sticks to the bottom of the palette while it scrolls.
 */
function ModelDetailCard({ model, text, favourite, onToggleFavourite, price, beside = false }: ModelDetailCardProps) {
  const { t } = useTranslation('workspace')
  return (
    <section
      aria-label={t('palette.details')}
      // The pointer hint means nothing on touch screens (a tap adds the device): wide screens only.
      className={`${beside ? BESIDE : STICKY} ${model === null ? 'hidden md:block' : ''} border-border px-3 py-2 text-xs text-fg-muted`}
    >
      {model === null || text === undefined ? (
        <p>{t('palette.detailsHint')}</p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <DeviceVisual kind={model.kind} modelId={model.id} className="h-6 w-6 shrink-0" illustrationClassName="-my-1 h-8 w-8 shrink-0" aria-hidden="true" />
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-tight text-fg-strong">{text.name}</h3>
            <button
              type="button"
              onClick={() => onToggleFavourite(model.id)}
              aria-pressed={favourite}
              aria-label={t(favourite ? 'palette.unfavourite' : 'palette.favourite', { name: text.name })}
              title={t(favourite ? 'palette.unfavourite' : 'palette.favourite', { name: text.name })}
              className={`-me-1 -mt-1 shrink-0 rounded p-1 hover:bg-amber-50 dark:hover:bg-amber-950/40 ${favourite ? 'text-amber-500' : 'text-fg-subtle'} ${focusRing}`}
            >
              <Star className={`h-4 w-4 ${favourite ? 'fill-amber-400' : ''}`} aria-hidden="true" />
            </button>
          </div>
          <p className="font-medium text-fg">{text.ports}</p>
          {/* Design (D2) */}
          {price !== undefined && <p className="font-semibold text-indigo-800 dark:text-indigo-200">{price}</p>}
          <p>{text.description}</p>
          <p className="font-semibold text-fg">{t('palette.useCase')}</p>
          <p>{text.useCase}</p>
        </div>
      )}
    </section>
  )
}

export default ModelDetailCard
