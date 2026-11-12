// Live labs (docs/LIVE_LABS.md §6, §8): one watcher's connection to a lab room on the MCP Worker.
// WebSocket for pushes, `GET /live/<id>` to catch up after a drop, keep-alive pings, reconnect with
// backoff. Transport, HTTP and timers are injected, so the whole state machine runs in unit tests.
import type { LabDocument } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { labSerializer, type LabParseResult } from '../lab'
import { LiveLabEndpoints } from './LiveLabEndpoints'
import { LiveLabProtocol, type LiveEvent, type LiveServerMessage } from './LiveLabProtocol'

export type LiveLabStatus = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'notFound' | 'error'

export type LiveLabSignal =
  | { type: 'status'; status: LiveLabStatus }
  /** A newer, valid document (already parsed and validated by labSerializer). */
  | { type: 'document'; doc: LabDocument; version: number }
  /** `fresh`: just happened (highlight it); otherwise history from a snapshot or catch-up. */
  | { type: 'events'; events: readonly LiveEvent[]; fresh: boolean }
  /** A newer document failed validation; the last good one stays. */
  | { type: 'invalidDocument'; version: number; errors: readonly LocalizedMessage[] }

export interface LiveSocketHandlers {
  open: () => void
  message: (text: string) => void
  /** The socket closed or failed to connect. */
  close: () => void
}

export interface LiveSocket {
  send: (text: string) => void
  close: () => void
}

export type LiveSocketFactory = (url: string, handlers: LiveSocketHandlers) => LiveSocket

export interface LiveHttpResponse {
  status: number
  json: () => Promise<unknown>
}

export type LiveFetch = (url: string) => Promise<LiveHttpResponse>

/** Runs `task` after `delayMs`; the returned function cancels it. */
export interface LiveClock {
  schedule: (task: () => void, delayMs: number) => () => void
}

export interface LiveLabConnectionDeps {
  endpoints: LiveLabEndpoints
  openSocket: LiveSocketFactory
  fetch: LiveFetch
  clock: LiveClock
  /** Default: labSerializer.parse (JSON → migrations → schema → invariants). */
  parseDocument?: (text: string) => LabParseResult
}

export const PING_INTERVAL_MS = 25_000
export const FIRST_RETRY_MS = 1_000
export const MAX_RETRY_MS = 30_000
const PING_MESSAGE = JSON.stringify({ type: 'ping' })
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404

/** setTimeout as a LiveClock. */
export const browserClock: LiveClock = {
  schedule: (task, delayMs) => {
    const timer = setTimeout(task, delayMs)
    return () => clearTimeout(timer)
  },
}

/** Browser transport: WebSocket, fetch without caching, setTimeout. */
export const browserLiveDeps = (): LiveLabConnectionDeps => ({
  endpoints: LiveLabEndpoints.fromEnvironment(),
  openSocket: (url, handlers) => {
    const socket = new WebSocket(url)
    socket.onopen = () => handlers.open()
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') handlers.message(event.data)
      else console.warn('Ignoring a non-text live lab message')
    }
    socket.onclose = () => handlers.close()
    return { send: (text) => socket.send(text), close: () => socket.close() }
  },
  fetch: (url) => fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' }),
  clock: browserClock,
})

/**
 * Keeps one live lab in sync. Signals newer valid documents only (stale versions are ignored, an
 * invalid document keeps the last good one), the activity events and the connection status.
 */
export class LiveLabConnection {
  private readonly labId: string
  private readonly deps: LiveLabConnectionDeps
  private readonly listener: (signal: LiveLabSignal) => void
  private readonly parseDocument: (text: string) => LabParseResult
  private status: LiveLabStatus | null = null
  /** Version of the last valid document (0 = none yet). */
  private version = 0
  private socket: LiveSocket | null = null
  /** Callbacks of an older socket are ignored. */
  private socketGeneration = 0
  private retryAttempt = 0
  private wasLive = false
  private started = false
  /** Stopped by the screen or ended for good (expired, not found, forbidden). */
  private finished = false
  private cancelPing: (() => void) | null = null
  private cancelRetry: (() => void) | null = null

  constructor(labId: string, listener: (signal: LiveLabSignal) => void, deps: LiveLabConnectionDeps) {
    this.labId = labId
    this.listener = listener
    this.deps = deps
    this.parseDocument = deps.parseDocument ?? ((text) => labSerializer.parse(text))
  }

  get currentStatus(): LiveLabStatus | null {
    return this.status
  }

  get currentVersion(): number {
    return this.version
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.setStatus('connecting')
    this.openSocket()
  }

  /** Closes the socket and cancels every timer; no signal follows. */
  stop(): void {
    this.finished = true
    this.closeSocket()
    this.cancelRetry?.()
    this.cancelRetry = null
  }

  private openSocket(): void {
    const generation = ++this.socketGeneration
    const current = () => generation === this.socketGeneration && !this.finished
    const handlers: LiveSocketHandlers = {
      open: () => {
        if (current()) this.schedulePing()
      },
      message: (text) => {
        if (current()) this.handleText(text)
      },
      close: () => {
        if (!current()) return
        this.socket = null
        this.stopPing()
        this.scheduleReconnect()
      },
    }
    try {
      this.socket = this.deps.openSocket(this.deps.endpoints.socketUrl(this.labId), handlers)
    } catch (error) {
      console.warn('The live lab socket could not be opened', error)
      this.scheduleReconnect()
    }
  }

  private handleText(text: string): void {
    const parsed = LiveLabProtocol.parseMessage(text)
    if (!parsed.ok) {
      console.warn(parsed.reason)
      return
    }
    this.handleMessage(parsed.value)
  }

  private handleMessage(message: LiveServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.retryAttempt = 0
        this.applyDocument(message.version, message.docText)
        this.emitEvents(message.events, false)
        this.wasLive = true
        this.setStatus('live')
        return
      case 'update':
        if (message.version <= this.version) return
        this.applyDocument(message.version, message.docText)
        if (message.event !== null) this.emitEvents([message.event], true)
        return
      case 'event':
        this.emitEvents([message.event], true)
        return
      case 'expired':
        this.end('ended')
        return
      case 'pong':
        return
    }
  }

  /** Signals the document when it is newer than the shown one and valid. */
  private applyDocument(version: number, docText: string): void {
    if (version <= this.version) return
    const result = this.parseDocument(docText)
    if (!result.ok) {
      console.warn(`Live lab version ${version} is not a valid lab; keeping version ${this.version}`, result.errors)
      this.listener({ type: 'invalidDocument', version, errors: result.errors })
      return
    }
    this.version = version
    this.listener({ type: 'document', doc: result.doc, version })
  }

  private emitEvents(events: readonly LiveEvent[], fresh: boolean): void {
    if (events.length > 0) this.listener({ type: 'events', events, fresh })
  }

  private scheduleReconnect(): void {
    if (this.finished) return
    this.setStatus(this.wasLive ? 'reconnecting' : 'connecting')
    const delay = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** this.retryAttempt)
    this.retryAttempt += 1
    this.cancelRetry?.()
    this.cancelRetry = this.deps.clock.schedule(() => {
      this.cancelRetry = null
      void this.catchUpAndReconnect()
    }, delay)
  }

  /** `GET /live/<id>` first: it tells a lab that is gone (404) apart from a dropped connection. */
  private async catchUpAndReconnect(): Promise<void> {
    if (this.finished) return
    let response: LiveHttpResponse
    let body: unknown
    try {
      response = await this.deps.fetch(this.deps.endpoints.documentUrl(this.labId))
      body = response.status === HTTP_OK ? await response.json() : null
    } catch (error) {
      console.warn('Live lab catch-up request failed; retrying', error)
      this.scheduleReconnect()
      return
    }
    if (this.finished) return
    if (response.status === HTTP_NOT_FOUND) return this.end('notFound')
    if (response.status === HTTP_FORBIDDEN) {
      console.error(`The live lab server refused this site's origin (HTTP ${response.status}); check APP_ORIGINS on the MCP Worker.`)
      return this.end('error')
    }
    if (response.status !== HTTP_OK) {
      console.warn(`Live lab catch-up answered HTTP ${response.status}; retrying`)
      this.scheduleReconnect()
      return
    }
    const parsed = LiveLabProtocol.parseCatchUp(body)
    if (parsed.ok) {
      this.applyDocument(parsed.value.version, parsed.value.docText)
      this.emitEvents(parsed.value.events, false)
    } else {
      console.warn(parsed.reason)
    }
    this.openSocket()
  }

  private schedulePing(): void {
    this.stopPing()
    this.cancelPing = this.deps.clock.schedule(() => {
      this.cancelPing = null
      try {
        this.socket?.send(PING_MESSAGE)
      } catch (error) {
        console.warn('Live lab keep-alive ping failed', error)
      }
      this.schedulePing()
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    this.cancelPing?.()
    this.cancelPing = null
  }

  private end(status: 'ended' | 'notFound' | 'error'): void {
    this.finished = true
    this.closeSocket()
    this.cancelRetry?.()
    this.cancelRetry = null
    this.setStatus(status)
  }

  private closeSocket(): void {
    this.stopPing()
    this.socketGeneration += 1
    const socket = this.socket
    this.socket = null
    try {
      socket?.close()
    } catch (error) {
      console.warn('Closing the live lab socket failed', error)
    }
  }

  private setStatus(status: LiveLabStatus): void {
    if (this.status === status) return
    this.status = status
    this.listener({ type: 'status', status })
  }
}
