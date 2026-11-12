// One live lab room (docs/LIVE_LABS.md §3): the document, its version, expiry and the last events,
// plus pushing changes to the watching browsers. Kept free of Workers APIs so it is unit-tested with
// memory fakes; LabRoom (the Durable Object) is a thin adapter around it. The Durable Object runs one
// call at a time (storage awaits hold its input gate), so read-compare-write here is atomic.
import { z } from 'zod'
import { MAX_LAB_TEXT_SIZE } from '../../../src/lab/schemas/labLimits'
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_ROOM_EVENTS,
  MAX_ROOM_WATCHERS,
  PING_MESSAGE,
  PONG_MESSAGE,
  ROOM_TTL_MS,
  type LiveEvent,
  type LiveEventDraft,
  type LiveServerMessage,
} from './LiveEvent'
import type { RoomSocket, RoomStorage } from './RoomStorage'

/**
 * Characters per stored document chunk. A SQLite-backed Durable Object allows 8 MB per key + value;
 * 1,000,000 characters are at most 3 MB as UTF-8, so a MAX_LAB_TEXT_SIZE document needs 5 chunks.
 */
export const DOC_CHUNK_CHARS = 1_000_000

const META_KEY = 'meta'
const EVENTS_KEY = 'events'
const chunkKey = (index: number): string => `doc:${index}`

const metaSchema = z.object({ version: z.number().int().min(1), expiresAt: z.number(), chunks: z.number().int().min(1) })
type RoomMeta = z.infer<typeof metaSchema>

const eventSchema = z.object({
  version: z.number().int(),
  at: z.string(),
  actor: z.literal('assistant'),
  tool: z.string(),
  summary: z.string(),
  deviceIds: z.array(z.string()),
  linkIds: z.array(z.string()),
  output: z.object({ deviceId: z.string(), command: z.string(), lines: z.array(z.string()) }).optional(),
})
const eventsSchema = z.array(eventSchema)

export interface RoomDoc {
  docText: string
  version: number
}

export interface RoomSnapshot extends RoomDoc {
  events: LiveEvent[]
}

export type CreateResult = { ok: true; version: number } | { ok: false; reason: 'exists' }
export type WriteResult = { ok: true; version: number } | { ok: false; reason: 'conflict' | 'notFound' }
export type NoteResult = { ok: true; version: number } | { ok: false; reason: 'notFound' }
export type AdmitResult = { ok: true; snapshot: string } | { ok: false; status: 404 | 429; message: string }

function byteLength(message: string | ArrayBuffer): number {
  return typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength
}

export class LabRoomState {
  private readonly storage: RoomStorage
  private readonly sockets: () => RoomSocket[]
  private readonly now: () => number

  constructor(storage: RoomStorage, sockets: () => RoomSocket[], now: () => number = Date.now) {
    this.storage = storage
    this.sockets = sockets
    this.now = now
  }

  /** Stores the first document (version 1); refused when the room already has one. */
  async create(docText: string, event?: LiveEventDraft): Promise<CreateResult> {
    if ((await this.meta()) !== null) return { ok: false, reason: 'exists' }
    const events = event === undefined ? [] : [{ ...event, version: 1 }]
    await this.store(docText, 1, events, 0)
    return { ok: true, version: 1 }
  }

  async read(): Promise<RoomDoc | null> {
    const meta = await this.meta()
    if (meta === null) return null
    return { docText: await this.docText(meta), version: meta.version }
  }

  async snapshot(): Promise<RoomSnapshot | null> {
    const meta = await this.meta()
    if (meta === null) return null
    return { docText: await this.docText(meta), version: meta.version, events: await this.events() }
  }

  /** Compare-and-set on the version; on success every watcher gets an `update`. */
  async write(docText: string, expectedVersion: number, draft: LiveEventDraft): Promise<WriteResult> {
    const meta = await this.meta()
    if (meta === null) return { ok: false, reason: 'notFound' }
    if (meta.version !== expectedVersion) return { ok: false, reason: 'conflict' }
    const version = meta.version + 1
    const event: LiveEvent = { ...draft, version }
    await this.store(docText, version, this.appended(await this.events(), event), meta.chunks)
    this.broadcast({ type: 'update', version, doc: docText, event })
    return { ok: true, version }
  }

  /** An event without a document change (stored and broadcast as `event`). */
  async note(draft: LiveEventDraft): Promise<NoteResult> {
    const meta = await this.meta()
    if (meta === null) return { ok: false, reason: 'notFound' }
    const event: LiveEvent = { ...draft, version: meta.version }
    await this.storage.put({ [EVENTS_KEY]: this.appended(await this.events(), event) })
    this.broadcast({ type: 'event', event })
    return { ok: true, version: meta.version }
  }

  /** The expiry alarm: deletes the room when its time has come (a later write moves the alarm). */
  async alarm(): Promise<void> {
    const raw = (await this.storage.get([META_KEY])).get(META_KEY)
    const meta = metaSchema.safeParse(raw)
    if (meta.success && meta.data.expiresAt > this.now()) {
      await this.storage.setAlarm(meta.data.expiresAt)
      return
    }
    await this.expire()
  }

  /** Whether one more browser may watch; when yes, the `snapshot` message to send it after accepting. */
  async admit(): Promise<AdmitResult> {
    const snapshot = await this.snapshot()
    if (snapshot === null) return { ok: false, status: 404, message: 'This live lab does not exist or has ended.' }
    if (this.sockets().length >= MAX_ROOM_WATCHERS) {
      return { ok: false, status: 429, message: `This live lab already has ${MAX_ROOM_WATCHERS} viewers. Close another tab and try again.` }
    }
    return { ok: true, snapshot: JSON.stringify({ type: 'snapshot', version: snapshot.version, doc: snapshot.docText, events: snapshot.events } satisfies LiveServerMessage) }
  }

  /** A browser's message: only pings are answered (when the auto-response did not), oversized ones close the socket. */
  message(socket: RoomSocket, message: string | ArrayBuffer): void {
    if (byteLength(message) > MAX_CLIENT_MESSAGE_BYTES) {
      socket.close(1009, 'Message too large')
      return
    }
    if (message === PING_MESSAGE) socket.send(PONG_MESSAGE)
  }

  private async meta(): Promise<RoomMeta | null> {
    const raw = (await this.storage.get([META_KEY])).get(META_KEY)
    if (raw === undefined) return null
    const meta = metaSchema.safeParse(raw)
    if (!meta.success) throw new Error(`LabRoom: stored meta is unreadable: ${meta.error.message}`)
    if (meta.data.expiresAt <= this.now()) {
      await this.expire()
      return null
    }
    return meta.data
  }

  private async docText(meta: RoomMeta): Promise<string> {
    const keys = Array.from({ length: meta.chunks }, (_, index) => chunkKey(index))
    const stored = await this.storage.get(keys)
    return keys
      .map((key) => {
        const chunk = stored.get(key)
        if (typeof chunk !== 'string') throw new Error(`LabRoom: document chunk ${key} is missing`)
        return chunk
      })
      .join('')
  }

  private async events(): Promise<LiveEvent[]> {
    const raw = (await this.storage.get([EVENTS_KEY])).get(EVENTS_KEY)
    if (raw === undefined) return []
    const events = eventsSchema.safeParse(raw)
    if (!events.success) {
      console.error('LabRoom: stored events are unreadable; starting a new event list', events.error.message)
      return []
    }
    return events.data
  }

  /** One atomic multi-key write: chunks, meta (version, renewed expiry), events; then the alarm. */
  private async store(docText: string, version: number, events: LiveEvent[], previousChunks: number): Promise<void> {
    if (docText.length > MAX_LAB_TEXT_SIZE) throw new Error(`LabRoom: document of ${docText.length} characters is over ${MAX_LAB_TEXT_SIZE}`)
    const chunks = Math.max(1, Math.ceil(docText.length / DOC_CHUNK_CHARS))
    const expiresAt = this.now() + ROOM_TTL_MS
    const entries: Record<string, unknown> = { [META_KEY]: { version, expiresAt, chunks } satisfies RoomMeta, [EVENTS_KEY]: events }
    for (let index = 0; index < chunks; index++) entries[chunkKey(index)] = docText.slice(index * DOC_CHUNK_CHARS, (index + 1) * DOC_CHUNK_CHARS)
    await this.storage.put(entries)
    if (previousChunks > chunks) {
      await this.storage.delete(Array.from({ length: previousChunks - chunks }, (_, offset) => chunkKey(chunks + offset)))
    }
    await this.storage.setAlarm(expiresAt)
  }

  private appended(events: readonly LiveEvent[], event: LiveEvent): LiveEvent[] {
    return [...events, event].slice(-MAX_ROOM_EVENTS)
  }

  private async expire(): Promise<void> {
    await this.storage.deleteAll()
    const expired = JSON.stringify({ type: 'expired' } satisfies LiveServerMessage)
    for (const socket of this.sockets()) {
      this.sendTo(socket, expired)
      try {
        socket.close(1000, 'Lab expired')
      } catch (error) {
        console.warn('LabRoom: could not close a watcher', error)
      }
    }
  }

  private broadcast(message: LiveServerMessage): void {
    const text = JSON.stringify(message)
    for (const socket of this.sockets()) this.sendTo(socket, text)
  }

  private sendTo(socket: RoomSocket, text: string): void {
    try {
      socket.send(text)
    } catch (error) {
      // A socket that is closing cannot be written to; the others still get the message.
      console.warn('LabRoom: could not send to a watcher', error)
    }
  }
}
