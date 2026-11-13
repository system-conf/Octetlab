// Share pages (docs/SHARE_PAGES.md §4): ids, paths and limits, without zod, so the app Worker (which
// only routes and checks sizes) stays small. The schemas live in shareContract.ts.

/** Share ids: 10 characters of [A-Za-z0-9] (≈ 59 bits), e.g. `/p/Ab3dEf7hIj`. */
export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{10}$/

/** Paths of the share API on the app origin (served by the app Worker, docs/SHARE_PAGES.md §5). */
export const SHARE_API_PATH = '/api/shares'

export const SHARE_LIMITS = {
  titleLength: 100,
  authorLength: 80,
  descriptionLength: 600,
  linkedinLength: 200,
  /** Compact lab JSON; share pages are portfolio snapshots, far below the 5 MB file limit. */
  docTextLength: 256_000,
  /** Whole request body (doc + texts + JSON overhead). */
  requestBytes: 300_000,
  /** Shares kept in total (storage guard on the Workers Free plan's 5 GB; docs/SHARE_PAGES.md §9). */
  maxShares: 10_000,
} as const

/** Error codes of the share API; the app maps each to a translated message. */
export const SHARE_ERROR_CODES = ['invalidRequest', 'invalidLab', 'tooLarge', 'notFound', 'forbidden', 'tooManyRequests', 'unavailable'] as const
export type ShareErrorCode = (typeof SHARE_ERROR_CODES)[number]
