import { useTranslation } from 'react-i18next'
import { usePreference } from '../../../preferences'
import DevicePalette from './DevicePalette'
import DevicePaletteBar from './DevicePaletteBar'
import type { PaletteProps } from './paletteProps'

interface WorkspacePaletteSlotProps extends PaletteProps {
  /** This slot is under the canvas (else: the left sidebar); it renders only when the preference picks it. */
  atBottom: boolean
}

/**
 * The device palette on wide screens (768 px and up), where Preferences → Appearance puts it: the
 * left sidebar (default) or the bar under the canvas. Phones keep the drawer (WorkspaceView).
 */
function WorkspacePaletteSlot({ atBottom, ...palette }: WorkspacePaletteSlotProps) {
  const { t } = useTranslation('workspace')
  const [layout] = usePreference('appearance.paletteLayout')
  if ((layout === 'bottomBar') !== atBottom) return null
  if (atBottom) {
    return (
      <div className="hidden md:contents">
        <DevicePaletteBar {...palette} />
      </div>
    )
  }
  return (
    <aside aria-labelledby="palette-heading" className="hidden w-56 shrink-0 overflow-y-auto border-e border-border bg-surface p-3 md:block">
      <h2 id="palette-heading" className="mb-2 text-sm font-semibold text-fg-strong">
        {t('palette.title')}
      </h2>
      <DevicePalette {...palette} />
    </aside>
  )
}

export default WorkspacePaletteSlot
