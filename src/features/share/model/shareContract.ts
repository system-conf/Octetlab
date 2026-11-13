// Share pages (docs/SHARE_PAGES.md §4): the wire contract between the app, the app Worker and the
// share store. One file for both sides, so client validation and server validation never drift.
import { z } from 'zod'
import { SHARE_ERROR_CODES, SHARE_ID_PATTERN, SHARE_LIMITS } from './shareLimits'
import { canonicalLinkedInUrl, ShareText } from './ShareText'

export { SHARE_API_PATH, SHARE_ERROR_CODES, SHARE_ID_PATTERN, SHARE_LIMITS, type ShareErrorCode } from './shareLimits'

const line = (max: number) => z.string().max(max * 4).transform((text) => ShareText.line(text)).pipe(z.string().max(max))

/** POST /api/shares body. Texts are cleaned here; the document is validated by the lab serializer. */
export const shareDraftSchema = z.object({
  doc: z.string().min(2).max(SHARE_LIMITS.docTextLength),
  title: line(SHARE_LIMITS.titleLength).pipe(z.string().min(1)),
  author: line(SHARE_LIMITS.authorLength),
  linkedinUrl: z
    .string()
    .max(SHARE_LIMITS.linkedinLength)
    .transform((text, context) => {
      if (text.trim() === '') return ''
      const canonical = canonicalLinkedInUrl(text)
      if (canonical === null) {
        context.addIssue({ code: 'custom', message: 'linkedinUrl' })
        return z.NEVER
      }
      return canonical
    }),
  description: z
    .string()
    .max(SHARE_LIMITS.descriptionLength * 4)
    .transform((text) => ShareText.paragraphs(text))
    .pipe(z.string().max(SHARE_LIMITS.descriptionLength)),
})

export type ShareDraft = z.infer<typeof shareDraftSchema>
export type ShareDraftInput = z.input<typeof shareDraftSchema>

/** GET /api/shares/<id>: the frozen snapshot. */
export const shareRecordSchema = z.object({
  id: z.string().regex(SHARE_ID_PATTERN),
  title: z.string(),
  author: z.string(),
  linkedinUrl: z.string(),
  description: z.string(),
  /** ISO 8601. */
  createdAt: z.string(),
  /** Compact lab JSON (parse with labSerializer). */
  doc: z.string(),
  /** Whether `/p/<id>/og.png` is a rendered topology (else the app's default image). */
  hasImage: z.boolean(),
})

export type ShareRecord = z.infer<typeof shareRecordSchema>

/** POST /api/shares answer. `deleteToken` only for the creator of a new share (null when the same content existed). */
export const shareCreatedSchema = z.object({
  id: z.string().regex(SHARE_ID_PATTERN),
  created: z.boolean(),
  deleteToken: z.string().nullable(),
})

export type ShareCreated = z.infer<typeof shareCreatedSchema>

export const shareErrorSchema = z.object({ error: z.enum(SHARE_ERROR_CODES), message: z.string() })
