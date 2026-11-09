import { useCallback, useSyncExternalStore } from 'react'
import type { AppUpdateModel, AppUpdatePhase } from '../../pwa/AppUpdateModel'

/** The current phase of the "new version available" toast; re-renders when it changes. */
export function useAppUpdatePhase(model: AppUpdateModel): AppUpdatePhase {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model])
  const getPhase = useCallback(() => model.getPhase(), [model])
  return useSyncExternalStore(subscribe, getPhase, getPhase)
}
