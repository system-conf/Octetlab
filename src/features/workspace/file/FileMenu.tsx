import { ChevronDown, Download, FileCode2, FilePlus2, FileText, FolderOpen, Globe, Link2, Settings, Upload, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
// PU (Preferences screen): File → Preferences opens the same dialog as the header's gear.
import { preferencesDialog } from '../../preferences/preferencesDialogState'
import { focusRing } from '../../shared/focusRing'
import { LAB_FILE_ACCEPT } from '../labServices'
import type { LabFileActions } from './useLabFileActions'

interface FileMenuProps {
  actions: LabFileActions
  onOpenRecent: () => void
  /** Design (D2): opens the handover pack of the lab. */
  onHandover: () => void
  /** CI (CLI integration): downloads the running-config of every device; absent = no menu item. */
  onExportConfigs?: () => void
  /** Share pages (docs/SHARE_PAGES.md): opens the share dialog; absent = no menu item. */
  onShare?: () => void
}

type ItemKey = 'newLab' | 'openRecent' | 'import' | 'export' | 'sharePage' | 'share' | 'handover' | 'exportConfigs' | 'preferences'

const ITEMS: readonly { key: ItemKey; icon: LucideIcon }[] = [
  { key: 'newLab', icon: FilePlus2 },
  { key: 'openRecent', icon: FolderOpen },
  { key: 'import', icon: Upload },
  { key: 'export', icon: Download },
  // Share pages (docs/SHARE_PAGES.md)
  { key: 'sharePage', icon: Globe },
  { key: 'share', icon: Link2 },
  // Design (D2)
  { key: 'handover', icon: FileText },
  // CI (CLI integration)
  { key: 'exportConfigs', icon: FileCode2 },
  // PU (Preferences screen)
  { key: 'preferences', icon: Settings },
]

/** "File" menu button of the free lab (menu button pattern: arrows, Home / End, Esc, Tab closes). */
function FileMenu({ actions, onOpenRecent, onHandover, onExportConfigs, onShare }: FileMenuProps) {
  const { t } = useTranslation(['workspace', 'lab', 'design', 'cli', 'preferences', 'share'])
  // CI (CLI integration): "Export configs" only where the screen offers it.
  const items = ITEMS.filter(
    (item) => (item.key !== 'exportConfigs' || onExportConfigs !== undefined) && (item.key !== 'sharePage' || onShare !== undefined),
  )
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<HTMLButtonElement[]>([])

  useEffect(() => {
    if (!open) return undefined
    itemRefs.current[0]?.focus()
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function run(key: ItemKey) {
    setOpen(false)
    buttonRef.current?.focus()
    switch (key) {
      case 'newLab':
        return actions.newLab()
      case 'openRecent':
        return onOpenRecent()
      case 'import':
        return fileRef.current?.click()
      case 'export':
        return actions.exportLab()
      case 'share':
        return actions.copyShareLink()
      case 'sharePage':
        return onShare?.()
      case 'handover':
        return onHandover()
      case 'exportConfigs':
        return onExportConfigs?.()
      case 'preferences':
        return preferencesDialog.show()
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current
    const index = items.findIndex((item) => item === document.activeElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    } else if (event.key === 'Tab') setOpen(false)
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  const label = (key: ItemKey): string => {
    switch (key) {
      case 'newLab':
        return t('lab:actions.newLab')
      case 'openRecent':
        return t('lab:actions.openRecent')
      case 'import':
        return t('lab:actions.import')
      case 'export':
        return t('lab:actions.export')
      case 'share':
        return t('lab:actions.share')
      case 'sharePage':
        return t('share:menuItem')
      case 'handover':
        return t('design:ui.handover.menuItem')
      case 'exportConfigs':
        return t('cli:ui.export.menuItem')
      case 'preferences':
        return t('preferences:open')
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          setOpen(true)
        }}
        className={`flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg hover:bg-surface-muted ${focusRing}`}
      >
        <FolderOpen className="h-5 w-5 sm:hidden" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t('workspace:header.file')}</span>
        <ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('workspace:header.file')}
          onKeyDown={handleMenuKeyDown}
          className="absolute start-0 z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {items.map(({ key, icon: Icon }, index) => (
            <button
              key={key}
              ref={(element) => {
                if (element) itemRefs.current[index] = element
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => run(key)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-fg hover:bg-surface-muted focus:bg-surface-muted ${focusRing}`}
            >
              <Icon className="h-4 w-4 text-fg-subtle" aria-hidden="true" />
              {label(key)}
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={LAB_FILE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) actions.importFile(file)
        }}
      />
    </div>
  )
}

export default FileMenu
