// share_link / import_share_link: Octetlab's own share format (`<app>/lab#lab=<lz-string>`).
import type { LabDocument } from '../../../src/domain'
import { LabShareLink, MAX_SHARE_HASH_LENGTH } from '../../../src/lab/LabShareLink'
import { ToolError } from '../errors/ToolError'
import type { EnglishMessages } from '../text/EnglishMessages'

/** Longest URL accepted by import_share_link: the longest hash plus room for the address. */
export const MAX_SHARE_URL_LENGTH = MAX_SHARE_HASH_LENGTH + 512

export class ShareLinks {
  private readonly links = new LabShareLink()
  private readonly messages: EnglishMessages
  private readonly appLabUrl: string

  constructor(messages: EnglishMessages, appLabUrl: string) {
    this.messages = messages
    this.appLabUrl = appLabUrl
  }

  url(doc: LabDocument): string {
    const result = this.links.url(doc, this.appLabUrl)
    if (!result.ok) throw ToolError.limit(`${result.errors.map((error) => this.messages.render(error)).join(' ')} Remove devices or notes to share it.`)
    return result.url
  }

  /** The lab of a share URL (or of its `#lab=…` part alone). */
  decode(link: string): LabDocument {
    const hashStart = link.indexOf('#')
    const hash = hashStart === -1 ? link : link.slice(hashStart)
    const result = this.links.decode(hash)
    if (result === null) throw ToolError.validation('This is not an Octetlab share link: it has no "#lab=…" part.')
    if (!result.ok) throw ToolError.validation(`The shared lab cannot be opened: ${result.errors.map((error) => this.messages.render(error)).join(' ')}`)
    return result.doc
  }
}
