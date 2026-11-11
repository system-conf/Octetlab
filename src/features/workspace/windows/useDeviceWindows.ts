import { useCallback, useMemo, useState } from 'react'
import type { DeviceTab } from '../panels/deviceTabModel'
import { DeviceWindowManager, type DeviceWindowState, type WindowArea } from './DeviceWindowManager'

export type DeviceWindow = DeviceWindowState<DeviceTab>

export interface DeviceWindowControls {
  /** Open windows back to front, fitted into the measured area. */
  windows: readonly DeviceWindow[]
  /** The front window that is not minimised (focus ring), or null. */
  activeId: string | null
  /** The canvas area the windows live in; null until measured. */
  area: WindowArea | null
  setArea: (area: WindowArea) => void
  /** Opens the device's window on `tab`, or brings its open window to the front. */
  open: (deviceId: string, tab: DeviceTab) => void
  focus: (deviceId: string) => void
  restore: (deviceId: string) => void
  minimise: (deviceId: string) => void
  close: (deviceId: string) => void
  move: (deviceId: string, x: number, y: number) => void
  resize: (deviceId: string, width: number, height: number) => void
  setTab: (deviceId: string, tab: DeviceTab) => void
}

interface WindowsState {
  /** The lab the windows belong to; opening another lab starts with none. */
  labId: string
  manager: DeviceWindowManager<DeviceTab>
}

/**
 * The floating device windows of the open lab (DeviceWindowManager in React state). Windows of devices
 * that are gone (deleted, undone) close by themselves. Session state only.
 */
export function useDeviceWindows(labId: string, deviceIds: readonly string[]): DeviceWindowControls {
  const [state, setState] = useState<WindowsState>(() => ({ labId, manager: DeviceWindowManager.empty<DeviceTab>() }))
  const [area, setAreaState] = useState<WindowArea | null>(null)
  const present = useMemo(() => new Set(deviceIds), [deviceIds])
  // Stable: the layer measures the canvas in an effect that depends on it.
  const setArea = useCallback(
    (next: WindowArea) =>
      setAreaState((previous) => (previous !== null && previous.width === next.width && previous.height === next.height ? previous : next)),
    [],
  )

  const currentOf = (from: WindowsState) => (from.labId === labId ? from.manager.retain(present) : DeviceWindowManager.empty<DeviceTab>())
  const manager = currentOf(state)

  function update(change: (manager: DeviceWindowManager<DeviceTab>) => DeviceWindowManager<DeviceTab>) {
    setState((previous) => {
      const before = currentOf(previous)
      const after = change(before)
      return after === previous.manager && previous.labId === labId ? previous : { labId, manager: after }
    })
  }

  return {
    windows: manager.fitted(area),
    activeId: manager.activeId,
    area,
    setArea,
    open: (deviceId, tab) => update((current) => current.open(deviceId, tab, area)),
    focus: (deviceId) => update((current) => current.focus(deviceId)),
    restore: (deviceId) => update((current) => current.restore(deviceId)),
    minimise: (deviceId) => update((current) => current.minimise(deviceId)),
    close: (deviceId) => update((current) => current.close(deviceId)),
    move: (deviceId, x, y) => update((current) => current.move(deviceId, x, y, area)),
    resize: (deviceId, width, height) => update((current) => current.resize(deviceId, width, height, area)),
    setTab: (deviceId, tab) => update((current) => current.setTab(deviceId, tab)),
  }
}
