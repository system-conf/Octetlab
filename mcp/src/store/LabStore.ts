// Labs between tool calls (docs/LIVE_LABS.md §4, expand step): one LabRoom Durable Object per lab holds
// the compact serialized LabDocument (LabSerializer) and its version; every change is a
// compare-and-set on that version. Labs saved before live labs are still in Workers KV (`lab:<id>`):
// a lab missing from its room is looked up there once and copied into the room. The KV fallback is
// removed in the contract step (≥ 2026-11-20). Loading validates the text with LabSerializer.parse
// like any lab file (schema + invariants).
import type { LabDocument } from '../../../src/domain'
import { labSerializer, type LabSerializer } from '../../../src/lab/LabSerializer'
import { MAX_LAB_TEXT_SIZE } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { LiveEventDraft } from '../live/LiveEvent'
import type { LabRooms } from '../live/LabRooms'
import type { EnglishMessages } from '../text/EnglishMessages'
import type { KeyValueStore } from './KeyValueStore'

/** Seven days. */
export const LAB_TTL_SECONDS = 7 * 24 * 60 * 60

/** 16 random bytes, base64url (22 characters). */
export const LAB_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

const LEGACY_KEY_PREFIX = 'lab:'
/** Fresh ids tried when a random id is already taken (practically never). */
const CREATE_ATTEMPTS = 3

function randomLabId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface StoredLab {
  doc: LabDocument
  version: number
}

export type SaveResult = { ok: true; doc: LabDocument; version: number } | { ok: false; reason: 'conflict' }

export interface LabStoreConfig {
  rooms: LabRooms
  /** Labs saved before live labs (read-only fallback). */
  legacy: KeyValueStore
  messages: EnglishMessages
  now?: () => Date
  serializer?: LabSerializer
}

export class LabStore {
  private readonly rooms: LabRooms
  private readonly legacy: KeyValueStore
  private readonly messages: EnglishMessages
  private readonly serializer: LabSerializer
  private readonly now: () => Date

  constructor(config: LabStoreConfig) {
    this.rooms = config.rooms
    this.legacy = config.legacy
    this.messages = config.messages
    this.now = config.now ?? (() => new Date())
    this.serializer = config.serializer ?? labSerializer
  }

  /** Stores a new lab (version 1) under a fresh random id; `event` starts its live feed. */
  async create(doc: LabDocument, event: LiveEventDraft): Promise<string> {
    const text = this.serialize(this.stamped(doc))
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
      const labId = randomLabId()
      const created = await this.rooms.room(labId).create(text, event)
      if (created.ok) return labId
    }
    throw new Error(`LabStore: ${CREATE_ATTEMPTS} random lab ids were all taken`)
  }

  /** The stored lab; a ToolError when the id is unknown or expired, an Error when the stored text is unreadable. */
  async load(labId: string): Promise<LabDocument> {
    return (await this.loadVersioned(labId)).doc
  }

  /** The stored lab and its version (for save's compare-and-set). */
  async loadVersioned(labId: string): Promise<StoredLab> {
    if (!LAB_ID_PATTERN.test(labId)) throw ToolError.validation(`"${labId}" is not a lab id. Use the labId returned by create_lab, open_sample or import_share_link.`)
    const room = this.rooms.room(labId)
    const stored = (await room.read()) ?? (await this.migrated(labId))
    if (stored === null) {
      throw ToolError.notFound(`Lab ${labId} does not exist or expired (labs are kept ${LAB_TTL_SECONDS / 86_400} days after their last change). Create a new lab or import a share link.`)
    }
    return { doc: this.parse(labId, stored.docText), version: stored.version }
  }

  /** Writes the lab (updatedAt = now) if it is still at `expectedVersion`; watchers get the change and `event`. */
  async save(labId: string, doc: LabDocument, expectedVersion: number, event: LiveEventDraft): Promise<SaveResult> {
    const saved = this.stamped(doc)
    const written = await this.rooms.room(labId).write(this.serialize(saved), expectedVersion, event)
    if (written.ok) return { ok: true, doc: saved, version: written.version }
    if (written.reason === 'conflict') return { ok: false, reason: 'conflict' }
    throw ToolError.notFound(`Lab ${labId} expired while this change was being made. Create a new lab or import a share link.`)
  }

  /** An event without a change (e.g. a ping that changed nothing). */
  async note(labId: string, event: LiveEventDraft): Promise<void> {
    const noted = await this.rooms.room(labId).note(event)
    if (!noted.ok) throw ToolError.notFound(`Lab ${labId} expired while this command ran. Create a new lab or import a share link.`)
  }

  /** A pre-live lab from KV, copied into its room (a concurrent copy that won is read back instead). */
  private async migrated(labId: string): Promise<{ docText: string; version: number } | null> {
    const text = await this.legacy.get(`${LEGACY_KEY_PREFIX}${labId}`)
    if (text === null) return null
    this.parse(labId, text)
    const room = this.rooms.room(labId)
    const created = await room.create(text)
    if (created.ok) return { docText: text, version: created.version }
    return room.read()
  }

  private parse(labId: string, text: string): LabDocument {
    const parsed = this.serializer.parse(text)
    if (!parsed.ok) {
      console.error(`LabStore: stored lab ${labId} is unreadable`, parsed.errors)
      throw new Error(`Stored lab ${labId} failed validation: ${parsed.errors.map((error) => this.messages.render(error)).join('; ')}`)
    }
    return parsed.doc
  }

  private stamped(doc: LabDocument): LabDocument {
    return { ...doc, meta: { ...doc.meta, updatedAt: this.now().toISOString() } }
  }

  private serialize(doc: LabDocument): string {
    const text = this.serializer.serializeCompact(doc)
    if (text.length > MAX_LAB_TEXT_SIZE) {
      throw ToolError.limit(`The lab is too large to store (${text.length} characters, limit ${MAX_LAB_TEXT_SIZE}). Remove devices or notes.`)
    }
    return text
  }
}
