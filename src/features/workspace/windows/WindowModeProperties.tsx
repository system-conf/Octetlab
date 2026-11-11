import { AppWindow, NotebookPen } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device } from '../../../domain'
import { focusRing } from '../../shared/focusRing'

/** What the canvas has selected, as far as window mode cares. */
export type WindowModeSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'device'; readonly device: Device; /** Its window is on screen (not minimised). */ readonly shown: boolean }
  | { readonly kind: 'other' }

interface WindowModePropertiesProps {
  selection: WindowModeSelection
  /** A free lab has notes (shown when nothing is selected); an exercise keeps them in its footer. */
  notesAvailable: boolean
  /** The properties panel with a close button that runs `onClose`. */
  renderProperties: (onClose: () => void) => ReactNode
  onClearSelection: () => void
  onOpenDevice: (deviceId: string) => void
}

const CORNER = 'pointer-events-auto absolute end-3 top-3 z-20'
const CARD = `${CORNER} flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xl`
const CHIP = `${CORNER} flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-start text-sm text-fg shadow-md hover:bg-surface-muted ${focusRing}`

/**
 * The right-hand properties when device details open in windows (wide screens): the map takes the
 * whole width. A cable, a note or several items show their properties in a card in the top corner;
 * one selected device offers its window (unless it is on screen); with nothing selected the lab's
 * notes open from a button. Rendered under the window layer, so a window dragged there stays on top.
 */
function WindowModeProperties({ selection, notesAvailable, renderProperties, onClearSelection, onOpenDevice }: WindowModePropertiesProps) {
  const { t } = useTranslation('workspace')
  const [notesOpen, setNotesOpen] = useState(false)

  if (selection.kind === 'other') return <div className={CARD}>{renderProperties(onClearSelection)}</div>
  if (selection.kind === 'device') {
    const { device } = selection
    if (selection.shown) return null
    return (
      <button type="button" onClick={() => onOpenDevice(device.id)} className={CHIP}>
        <AppWindow className="h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{t('windows.openDevice', { name: device.name })}</span>
          <span className="text-xs text-fg-subtle">{t('windows.openHint')}</span>
        </span>
      </button>
    )
  }
  if (!notesAvailable) return null
  if (notesOpen) return <div className={CARD}>{renderProperties(() => setNotesOpen(false))}</div>
  return (
    <button type="button" onClick={() => setNotesOpen(true)} className={CHIP}>
      <NotebookPen className="h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
      {t('windows.notes')}
    </button>
  )
}

export default WindowModeProperties
