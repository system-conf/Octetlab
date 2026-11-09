// Labs between tool calls (docs/MCP_SERVER.md): key `lab:<id>`, value = compact serialized
// LabDocument (LabSerializer), 7-day TTL renewed by every save. Loading validates the stored text
// with LabSerializer.parse like any lab file (schema + invariants).
import type { LabDocument } from '../../../src/domain'
import { labSerializer, type LabSerializer } from '../../../src/lab/LabSerializer'
import { MAX_LAB_TEXT_SIZE } from '../../../src/lab/schemas/labLimits'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'
import type { KeyValueStore } from './KeyValueStore'

/** Seven days. */
export const LAB_TTL_SECONDS = 7 * 24 * 60 * 60

/** 16 random bytes, base64url (22 characters). */
export const LAB_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

const KEY_PREFIX = 'lab:'

function randomLabId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export class LabStore {
  private readonly store: KeyValueStore
  private readonly messages: EnglishMessages
  private readonly serializer: LabSerializer
  private readonly now: () => Date

  constructor(store: KeyValueStore, messages: EnglishMessages, now: () => Date = () => new Date(), serializer: LabSerializer = labSerializer) {
    this.store = store
    this.messages = messages
    this.now = now
    this.serializer = serializer
  }

  /** Stores a new lab under a fresh random id. */
  async create(doc: LabDocument): Promise<string> {
    const labId = randomLabId()
    await this.save(labId, doc)
    return labId
  }

  /** The stored lab; a ToolError when the id is unknown, expired or the stored text is unreadable. */
  async load(labId: string): Promise<LabDocument> {
    if (!LAB_ID_PATTERN.test(labId)) throw ToolError.validation(`"${labId}" is not a lab id. Use the labId returned by create_lab, open_sample or import_share_link.`)
    const text = await this.store.get(`${KEY_PREFIX}${labId}`)
    if (text === null) {
      throw ToolError.notFound(`Lab ${labId} does not exist or expired (labs are kept ${LAB_TTL_SECONDS / 86_400} days after their last change). Create a new lab or import a share link.`)
    }
    const parsed = this.serializer.parse(text)
    if (!parsed.ok) {
      console.error(`LabStore: stored lab ${labId} is unreadable`, parsed.errors)
      throw new Error(`Stored lab ${labId} failed validation: ${parsed.errors.map((error) => this.messages.render(error)).join('; ')}`)
    }
    return parsed.doc
  }

  /** Writes the lab (updatedAt = now) and renews its TTL. */
  async save(labId: string, doc: LabDocument): Promise<LabDocument> {
    const saved: LabDocument = { ...doc, meta: { ...doc.meta, updatedAt: this.now().toISOString() } }
    const text = this.serializer.serializeCompact(saved)
    if (text.length > MAX_LAB_TEXT_SIZE) {
      throw ToolError.limit(`The lab is too large to store (${text.length} characters, limit ${MAX_LAB_TEXT_SIZE}). Remove devices or notes.`)
    }
    await this.store.put(`${KEY_PREFIX}${labId}`, text, LAB_TTL_SECONDS)
    return saved
  }
}
