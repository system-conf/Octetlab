import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import { DeviceVisual } from '../labServices'
import type { DeviceTab } from '../panels/deviceTabModel'
import DeviceWindow from './DeviceWindow'
import type { DeviceWindowControls } from './useDeviceWindows'

/** Device icons in their category colour, as on the map. */
const ICON_TONE = 'category'

interface DeviceWindowLayerProps {
  controls: DeviceWindowControls
  devices: readonly Device[]
  /** The device's tabs on `tab` (the same DeviceTabs the properties panel shows). */
  renderTabs: (device: Device, tab: DeviceTab, onTab: (tab: DeviceTab) => void) => ReactNode
}

/**
 * The floating device windows over the canvas (Preferences → Appearance → device details "in a
 * window"), and the dock of minimised windows in the bottom-left corner. The layer itself lets the
 * pointer through to the map; it measures the canvas so windows stay inside it.
 */
function DeviceWindowLayer({ controls, devices, renderTabs }: DeviceWindowLayerProps) {
  const { t } = useTranslation('workspace')
  const layerRef = useRef<HTMLDivElement>(null)
  const { setArea } = controls

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (layer === null) return undefined
    const measure = () => setArea({ width: layer.clientWidth, height: layer.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(layer)
    return () => observer.disconnect()
  }, [setArea])

  const deviceOf = (deviceId: string) => devices.find((device) => device.id === deviceId)
  // Stable DOM order (by device id), so bringing a window to the front never moves a focused field;
  // the stacking order is the z-index.
  const zIndexOf = new Map(controls.windows.map((entry, index) => [entry.deviceId, index + 1]))
  const shown = [...controls.windows].sort((a, b) => a.deviceId.localeCompare(b.deviceId))
  const docked = controls.windows.filter((entry) => entry.minimised)

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {shown.map((entry) => {
        const device = deviceOf(entry.deviceId)
        if (device === undefined) return null
        const id = entry.deviceId
        return (
          <DeviceWindow
            key={id}
            device={device}
            rect={entry.rect}
            minimised={entry.minimised}
            active={controls.activeId === id}
            zIndex={zIndexOf.get(id) ?? 1}
            area={controls.area}
            onFocus={() => controls.focus(id)}
            onMinimise={() => controls.minimise(id)}
            onClose={() => controls.close(id)}
            onMove={(x, y) => controls.move(id, x, y)}
            onResize={(width, height) => controls.resize(id, width, height)}
          >
            {renderTabs(device, entry.tab, (tab) => controls.setTab(id, tab))}
          </DeviceWindow>
        )
      })}
      {docked.length > 0 && (
        <div role="group" aria-label={t('windows.dock')} className="pointer-events-auto absolute bottom-3 start-3 z-[100] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
          {docked.map((entry) => {
            const device = deviceOf(entry.deviceId)
            if (device === undefined) return null
            return (
              <button
                key={entry.deviceId}
                type="button"
                onClick={() => controls.restore(entry.deviceId)}
                aria-label={t('windows.restore', { name: device.name })}
                className={`flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface py-1 ps-1.5 pe-2.5 text-xs font-medium text-fg shadow-md hover:bg-surface-muted ${focusRing}`}
              >
                <DeviceVisual kind={device.kind} modelId={device.modelId} tone={ICON_TONE} className="h-4 w-4" illustrationClassName="h-5 w-5" aria-hidden="true" />
                {device.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DeviceWindowLayer
