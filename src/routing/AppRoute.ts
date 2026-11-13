// The app's screens as path-based routes (History API). Cloudflare serves index.html for every
// path (SPA fallback), so a reload or a shared link opens the same screen again.

export type AppRoute =
  /** `/`: the lab workspace (last lab) with the Start dialog open, like a desktop lab app's start screen. */
  | { name: 'landing' }
  /** The workspace with the current (autosaved) lab; `#lab=…` opens a shared lab. */
  | { name: 'lab' }
  /** `/about`: what Octetlab is (the former start page; first-time visitors and search engines). */
  | { name: 'about' }
  /** Share pages (docs/SHARE_PAGES.md): a frozen, read-only snapshot of a lab (`/p/<shareId>`). */
  | { name: 'share'; shareId: string }
  | { name: 'exercises' }
  | { name: 'exercise'; exerciseId: string }
  /** Solution report shown after a successful verification. */
  | { name: 'exerciseReport'; exerciseId: string }
  /** Design (D2): list of the design briefs (`/design`). */
  | { name: 'designs' }
  /** Design (D2): the workspace in design mode for one brief (`/design/<id>`). */
  | { name: 'design'; briefId: string }
  /** Design (D2): design review after "Submit design" (`/design/<id>/review`). */
  | { name: 'designReview'; briefId: string }
  /** SL1 (sample labs): the sample list (`/samples`). */
  | { name: 'samples' }
  /** SL1 (sample labs): one sample opened as a free lab with its lesson panel (`/samples/<id>`). */
  | { name: 'sample'; sampleId: string }
  /** PU (Preferences screen): the user's preferences (`/preferences`). */
  | { name: 'preferences' }
  /** Live labs: a lab an assistant builds through the MCP server, watched read-only (`/live/<labId>`). */
  | { name: 'live'; labId: string }
  /** Any other path; the app sends the user to the landing page. */
  | { name: 'notFound'; path: string }

/** Exercise and brief ids are camelCase identifiers (docs/PLAN.md §1). */
const EXERCISE_ID = /^[A-Za-z][A-Za-z0-9]*$/
/** Live labs: the MCP server's 22-character lab ids (mcp/src/store/LabStore.ts LAB_ID_PATTERN). */
const LIVE_LAB_ID = /^[A-Za-z0-9_-]{22}$/
/** Share pages: the share store's 10-character ids (src/features/share/model/shareContract.ts SHARE_ID_PATTERN). */
const SHARE_ID = /^[A-Za-z0-9]{10}$/

/** Pure path ↔ route mapping. */
export class AppRouteCodec {
  /** Route of a URL path; trailing slashes and empty segments are ignored. */
  static parse(pathname: string): AppRoute {
    const segments = pathname.split('/').filter((segment) => segment !== '')
    const [first, second, third, ...rest] = segments
    if (first === undefined) return { name: 'landing' }
    if (first === 'lab' && second === undefined) return { name: 'lab' }
    if (first === 'preferences') return second === undefined ? { name: 'preferences' } : { name: 'notFound', path: pathname }
    if (first === 'about') return second === undefined ? { name: 'about' } : { name: 'notFound', path: pathname }
    if (first === 'p') return AppRouteCodec.parseShare(pathname, second, third)
    // SL1 (sample labs): `/samples` and `/samples/<id>`; anything deeper is not found.
    if (first === 'samples') return AppRouteCodec.parseSample(pathname, second, third)
    if (first === 'live') return AppRouteCodec.parseLive(pathname, second, third)
    if ((first !== 'exercises' && first !== 'design') || rest.length > 0) return { name: 'notFound', path: pathname }
    if (second === undefined) return first === 'exercises' ? { name: 'exercises' } : { name: 'designs' }
    const id = AppRouteCodec.decode(second)
    if (id === null || !EXERCISE_ID.test(id)) return { name: 'notFound', path: pathname }
    if (first === 'design') {
      if (third === undefined) return { name: 'design', briefId: id }
      return third === 'review' ? { name: 'designReview', briefId: id } : { name: 'notFound', path: pathname }
    }
    if (third === undefined) return { name: 'exercise', exerciseId: id }
    return third === 'report' ? { name: 'exerciseReport', exerciseId: id } : { name: 'notFound', path: pathname }
  }

  /** URL path of a route (`notFound` keeps its path). */
  static format(route: AppRoute): string {
    switch (route.name) {
      case 'landing':
        return '/'
      case 'lab':
        return '/lab'
      case 'about':
        return '/about'
      case 'share':
        return `/p/${encodeURIComponent(route.shareId)}`
      case 'exercises':
        return '/exercises'
      case 'exercise':
        return `/exercises/${encodeURIComponent(route.exerciseId)}`
      case 'exerciseReport':
        return `/exercises/${encodeURIComponent(route.exerciseId)}/report`
      case 'designs':
        return '/design'
      case 'design':
        return `/design/${encodeURIComponent(route.briefId)}`
      case 'designReview':
        return `/design/${encodeURIComponent(route.briefId)}/review`
      // SL1 (sample labs)
      case 'samples':
        return '/samples'
      case 'sample':
        return `/samples/${encodeURIComponent(route.sampleId)}`
      // PU (Preferences screen)
      case 'preferences':
        return '/preferences'
      case 'live':
        return `/live/${encodeURIComponent(route.labId)}`
      case 'notFound':
        return route.path
    }
  }

  static equals(first: AppRoute, second: AppRoute): boolean {
    return AppRouteCodec.format(first) === AppRouteCodec.format(second)
  }

  /** SL1 (sample labs): `/samples` (no id) or `/samples/<camelCase id>`. */
  private static parseSample(pathname: string, idSegment: string | undefined, deeper: string | undefined): AppRoute {
    if (idSegment === undefined) return { name: 'samples' }
    const id = AppRouteCodec.decode(idSegment)
    if (deeper !== undefined || id === null || !EXERCISE_ID.test(id)) return { name: 'notFound', path: pathname }
    return { name: 'sample', sampleId: id }
  }

  /** Live labs: `/live/<22-character lab id>`; no list page, nothing deeper. */
  private static parseLive(pathname: string, idSegment: string | undefined, deeper: string | undefined): AppRoute {
    const id = idSegment === undefined ? null : AppRouteCodec.decode(idSegment)
    if (deeper !== undefined || id === null || !LIVE_LAB_ID.test(id)) return { name: 'notFound', path: pathname }
    return { name: 'live', labId: id }
  }

  /** Share pages: `/p/<10-character share id>`; no list page, nothing deeper. */
  private static parseShare(pathname: string, idSegment: string | undefined, deeper: string | undefined): AppRoute {
    const id = idSegment === undefined ? null : AppRouteCodec.decode(idSegment)
    if (deeper !== undefined || id === null || !SHARE_ID.test(id)) return { name: 'notFound', path: pathname }
    return { name: 'share', shareId: id }
  }

  private static decode(segment: string): string | null {
    try {
      return decodeURIComponent(segment)
    } catch (error) {
      console.warn(`Malformed path segment '${segment}'`, error)
      return null
    }
  }
}

/** Route values for links and navigation (keeps route literals out of JSX). */
export const routes = {
  landing: { name: 'landing' },
  lab: { name: 'lab' },
  about: { name: 'about' },
  share: (shareId: string): AppRoute => ({ name: 'share', shareId }),
  exercises: { name: 'exercises' },
  exercise: (exerciseId: string): AppRoute => ({ name: 'exercise', exerciseId }),
  exerciseReport: (exerciseId: string): AppRoute => ({ name: 'exerciseReport', exerciseId }),
  designs: { name: 'designs' },
  design: (briefId: string): AppRoute => ({ name: 'design', briefId }),
  designReview: (briefId: string): AppRoute => ({ name: 'designReview', briefId }),
  // SL1 (sample labs)
  samples: { name: 'samples' },
  sample: (sampleId: string): AppRoute => ({ name: 'sample', sampleId }),
  // PU (Preferences screen)
  preferences: { name: 'preferences' },
  // Live labs
  live: (labId: string): AppRoute => ({ name: 'live', labId }),
} as const satisfies Record<string, AppRoute | ((id: string) => AppRoute)>
