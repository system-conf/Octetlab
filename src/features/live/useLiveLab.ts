import { useEffect, useState, useSyncExternalStore } from 'react'
import { browserClock, browserLiveDeps, LiveLabConnection, type LiveLabSignal } from '../../live'
import { LiveLabStore, type LiveLabViewState } from './model/LiveLabStore'

/** What the hook needs from a connection (LiveLabConnection in the app, a fake in tests). */
export interface LiveConnectionHandle {
  start: () => void
  stop: () => void
}

export type LiveConnectionFactory = (labId: string, listener: (signal: LiveLabSignal) => void) => LiveConnectionHandle

/** The MCP Worker over WebSocket + fetch (VITE_LIVE_API_ORIGIN). */
export const browserLiveConnection: LiveConnectionFactory = (labId, listener) => new LiveLabConnection(labId, listener, browserLiveDeps())

/**
 * Live labs: the watched lab's state (status, last good document, feed, highlight). Connects on
 * mount, disconnects on unmount; the state machine is LiveLabStore.
 */
export function useLiveLab(labId: string, connect: LiveConnectionFactory = browserLiveConnection): LiveLabViewState {
  const [store] = useState(() => new LiveLabStore(browserClock))

  useEffect(() => {
    const connection = connect(labId, store.receive)
    connection.start()
    return () => {
      connection.stop()
      store.clearTimers()
    }
  }, [connect, labId, store])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
