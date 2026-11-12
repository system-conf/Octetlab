// Live labs: the screen's state machine. Turns the connection's signals into one immutable view
// state (status, last good document, activity feed, current highlight, last problem) that React
// reads through useSyncExternalStore. Timers are injected (highlight fade-out).
import type { LabDocument } from '../../../domain'
import type { LocalizedMessage } from '../../../domain/Messages'
import type { LiveClock, LiveEvent, LiveLabSignal, LiveLabStatus } from '../../../live'

/** How long changed devices and cables glow (docs/LIVE_LABS.md §8: ~2.5 s). */
export const HIGHLIGHT_MS = 2_500
/** Feed entries kept in memory (the server keeps the last 50). */
export const MAX_FEED_EVENTS = 200

export interface LiveHighlight {
  deviceIds: readonly string[]
  linkIds: readonly string[]
  /** New for every change, so the glow restarts. */
  key: number
}

/** A newer document that failed validation (shown as a toast once per key). */
export interface LiveLabProblem {
  key: number
  version: number
  errors: readonly LocalizedMessage[]
}

export interface LiveLabViewState {
  status: LiveLabStatus
  /** Last valid document, or null before the first one. */
  doc: LabDocument | null
  version: number
  /** Newest first. */
  events: readonly LiveEvent[]
  highlight: LiveHighlight | null
  problem: LiveLabProblem | null
}

export const INITIAL_LIVE_STATE: LiveLabViewState = {
  status: 'connecting',
  doc: null,
  version: 0,
  events: [],
  highlight: null,
  problem: null,
}

function eventKey(event: LiveEvent): string {
  return `${event.version}|${event.at}|${event.tool}|${event.summary}`
}

/** Newest first: higher version first, then later time. */
function newestFirst(first: LiveEvent, second: LiveEvent): number {
  if (first.version !== second.version) return second.version - first.version
  return first.at < second.at ? 1 : first.at > second.at ? -1 : 0
}

function union(first: readonly string[], second: readonly string[]): string[] {
  return [...new Set([...first, ...second])]
}

export class LiveLabStore {
  private state: LiveLabViewState = INITIAL_LIVE_STATE
  private readonly clock: LiveClock
  private readonly listeners = new Set<() => void>()
  private cancelHighlight: (() => void) | null = null
  private nextKey = 1

  constructor(clock: LiveClock) {
    this.clock = clock
  }

  readonly subscribe = (onChange: () => void): (() => void) => {
    this.listeners.add(onChange)
    return () => this.listeners.delete(onChange)
  }

  readonly getSnapshot = (): LiveLabViewState => this.state

  /** The connection's listener. */
  readonly receive = (signal: LiveLabSignal): void => {
    switch (signal.type) {
      case 'status':
        this.update({ status: signal.status })
        return
      case 'document':
        if (signal.version <= this.state.version) return
        this.update({ doc: signal.doc, version: signal.version })
        return
      case 'invalidDocument':
        this.update({ problem: { key: this.takeKey(), version: signal.version, errors: signal.errors } })
        return
      case 'events':
        this.addEvents(signal.events, signal.fresh)
        return
    }
  }

  /** Cancels the highlight timer (the screen unmounts); the state stays readable. */
  clearTimers(): void {
    this.cancelHighlight?.()
    this.cancelHighlight = null
  }

  private addEvents(incoming: readonly LiveEvent[], fresh: boolean): void {
    const known = new Set(this.state.events.map(eventKey))
    const added = incoming.filter((event) => !known.has(eventKey(event)))
    if (added.length === 0) return
    const events = [...this.state.events, ...added].sort(newestFirst).slice(0, MAX_FEED_EVENTS)
    if (!fresh) {
      this.update({ events })
      return
    }
    const deviceIds = added.flatMap((event) => event.deviceIds)
    const linkIds = added.flatMap((event) => event.linkIds)
    if (deviceIds.length === 0 && linkIds.length === 0) {
      this.update({ events })
      return
    }
    const current = this.state.highlight
    const highlight: LiveHighlight = {
      deviceIds: union(current?.deviceIds ?? [], deviceIds),
      linkIds: union(current?.linkIds ?? [], linkIds),
      key: this.takeKey(),
    }
    this.update({ events, highlight })
    this.clearTimers()
    this.cancelHighlight = this.clock.schedule(() => {
      this.cancelHighlight = null
      this.update({ highlight: null })
    }, HIGHLIGHT_MS)
  }

  private takeKey(): number {
    const key = this.nextKey
    this.nextKey += 1
    return key
  }

  private update(changes: Partial<LiveLabViewState>): void {
    this.state = { ...this.state, ...changes }
    for (const listener of this.listeners) listener()
  }
}
