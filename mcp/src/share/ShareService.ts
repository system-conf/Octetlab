// What the ShareStore Durable Object does (docs/SHARE_PAGES.md §3–§5): validate a share request at
// the boundary (zod + the lab serializer), store the frozen snapshot once per content, render its
// Open Graph image once, serve it, and delete it for the holder of the delete token. Free of Workers
// APIs, so it is unit-tested with node:sqlite and a fake renderer.
import type { LabDocument } from '../../../src/domain'
import { labSerializer } from '../../../src/lab/LabSerializer'
import { SHARE_ID_PATTERN, SHARE_LIMITS, shareDraftSchema, type ShareErrorCode, type ShareRecord } from '../../../src/features/share/model/shareContract'
import { OgImageSvg } from './OgImageSvg'
import { ShareCrypto } from './ShareCrypto'
import type { DeleteOutcome, ShareRepository } from './ShareRepository'

export type CreateOutcome = { ok: true; id: string; created: boolean; deleteToken: string | null } | { ok: false; error: ShareErrorCode; message: string }

/** What the app Worker needs to write a share page's meta tags. */
export interface ShareMeta {
  id: string
  title: string
  author: string
  description: string
  hasImage: boolean
}

/** SVG → PNG (resvg in the Worker). */
export interface PngRenderer {
  render(svg: string): Promise<Uint8Array>
}

const ID_ATTEMPTS = 3

export class ShareService {
  private readonly repository: ShareRepository
  private readonly renderer: PngRenderer
  private readonly now: () => Date

  constructor(repository: ShareRepository, renderer: PngRenderer, now: () => Date = () => new Date()) {
    this.repository = repository
    this.renderer = renderer
    this.now = now
  }

  /** `bodyText`: the raw POST body (JSON of ShareDraftInput). */
  async create(bodyText: string): Promise<CreateOutcome> {
    if (bodyText.length > SHARE_LIMITS.requestBytes) return this.refuse('tooLarge', `The request is over ${SHARE_LIMITS.requestBytes} characters.`)
    let json: unknown
    try {
      json = JSON.parse(bodyText)
    } catch (error) {
      return this.refuse('invalidRequest', `The request is not JSON: ${String(error)}`)
    }
    const draft = shareDraftSchema.safeParse(json)
    if (!draft.success) {
      const docTooLong = draft.error.issues.some((issue) => issue.path[0] === 'doc' && issue.code === 'too_big')
      if (docTooLong) return this.refuse('tooLarge', `The lab is over ${SHARE_LIMITS.docTextLength} characters.`)
      return this.refuse('invalidRequest', draft.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    }
    const lab = labSerializer.parse(draft.data.doc)
    if (!lab.ok) return this.refuse('invalidLab', `The lab is not valid (${lab.errors.map((error) => error.key).join(', ')}).`)
    if (this.repository.count() >= SHARE_LIMITS.maxShares) return this.refuse('unavailable', 'The share store is full.')

    const docText = labSerializer.serializeCompact(lab.doc)
    const { title, author, linkedinUrl, description } = draft.data
    const contentHash = await ShareCrypto.sha256Hex(JSON.stringify([docText, title, author, linkedinUrl, description]))
    const deleteToken = ShareCrypto.newToken()
    const deleteTokenHash = await ShareCrypto.sha256Hex(deleteToken)
    const createdAt = this.now().toISOString()

    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const outcome = this.repository.insert({ id: ShareCrypto.newId(), contentHash, deleteTokenHash, title, author, linkedinUrl, description, docText, createdAt })
      if (outcome.kind === 'idTaken') continue
      if (outcome.kind === 'existing') return { ok: true, id: outcome.id, created: false, deleteToken: null }
      await this.renderImage(outcome.id, lab.doc)
      return { ok: true, id: outcome.id, created: true, deleteToken }
    }
    throw new Error(`ShareStore: no free share id after ${ID_ATTEMPTS} attempts`)
  }

  read(id: string): ShareRecord | null {
    if (!SHARE_ID_PATTERN.test(id)) return null
    const share = this.repository.find(id)
    if (share === null) return null
    return {
      id: share.id,
      title: share.title,
      author: share.author,
      linkedinUrl: share.linkedinUrl,
      description: share.description,
      createdAt: share.createdAt,
      doc: share.docText,
      hasImage: share.hasImage,
    }
  }

  meta(id: string): ShareMeta | null {
    const share = this.read(id)
    if (share === null) return null
    return { id: share.id, title: share.title, author: share.author, description: share.description, hasImage: share.hasImage }
  }

  image(id: string): Uint8Array | null {
    return SHARE_ID_PATTERN.test(id) ? this.repository.image(id) : null
  }

  async remove(id: string, deleteToken: string): Promise<DeleteOutcome> {
    if (!SHARE_ID_PATTERN.test(id)) return 'notFound'
    return this.repository.delete(id, await ShareCrypto.sha256Hex(deleteToken))
  }

  /** A failed render leaves the share without its own image (the page then uses the app's default one). */
  private async renderImage(id: string, doc: LabDocument): Promise<void> {
    try {
      this.repository.setImage(id, await this.renderer.render(OgImageSvg.build(doc)))
    } catch (error) {
      console.error(`ShareStore: the Open Graph image of share ${id} could not be rendered; the default image is used.`, error)
    }
  }

  private refuse(error: ShareErrorCode, message: string): CreateOutcome {
    return { ok: false, error, message }
  }
}
