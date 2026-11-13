import type { AppRoute } from './AppRoute'

export interface RouteContext {
  /** Ids of the exercises that exist. */
  exerciseIds: readonly string[]
  /** Exercise whose solution report is in memory (just verified), or null. */
  reportExerciseId: string | null
  /** The URL carries a `#lab=…` share hash (it belongs to the workspace). */
  hasShareHash: boolean
  /**
   * Design (D2): ids of the design briefs that exist. Absent = not known here: the design routes
   * render and the lazily loaded design module resolves them again with the ids.
   */
  briefIds?: readonly string[]
  /** Design (D2): brief whose submitted design is in memory (review ready), or null. */
  reviewBriefId?: string | null
  /**
   * SL1 (sample labs): ids of the available samples. Absent = not known here: the sample routes
   * render and the lazily loaded sample module resolves them again with the ids.
   */
  sampleIds?: readonly string[]
}

export type RouteDecision = { kind: 'render' } | { kind: 'redirect'; to: AppRoute; keepHash: boolean }

const RENDER: RouteDecision = { kind: 'render' }

function redirect(to: AppRoute): RouteDecision {
  return { kind: 'redirect', to, keepHash: false }
}

/**
 * Redirects of the app (always as history replacements): unknown paths → landing; a share hash
 * outside the workspace → `/lab` with the hash; unknown exercise → list; a report without a
 * verified attempt (reload, typed URL) → the exercise. Design briefs work the same way: unknown
 * brief → brief list, a review without a submitted design → the brief.
 */
export class RouteResolver {
  static resolve(route: AppRoute, context: RouteContext): RouteDecision {
    if (context.hasShareHash && route.name !== 'lab') return { kind: 'redirect', to: { name: 'lab' }, keepHash: true }
    switch (route.name) {
      case 'landing':
      case 'lab':
      case 'exercises':
      case 'designs':
      case 'samples':
      case 'preferences':
      case 'live':
      case 'about':
      case 'share':
        // Live labs and share pages: the screen itself reports a lab / share that does not exist (any more).
        return RENDER
      case 'notFound':
        return redirect({ name: 'landing' })
      case 'exercise':
      case 'exerciseReport':
        if (!context.exerciseIds.includes(route.exerciseId)) return redirect({ name: 'exercises' })
        if (route.name === 'exerciseReport' && context.reportExerciseId !== route.exerciseId) {
          return redirect({ name: 'exercise', exerciseId: route.exerciseId })
        }
        return RENDER
      case 'design':
      case 'designReview':
        if (context.briefIds === undefined) return RENDER
        if (!context.briefIds.includes(route.briefId)) return redirect({ name: 'designs' })
        if (route.name === 'designReview' && (context.reviewBriefId ?? null) !== route.briefId) return redirect({ name: 'design', briefId: route.briefId })
        return RENDER
      // SL1 (sample labs): an unknown or unavailable sample → the sample list.
      case 'sample':
        if (context.sampleIds === undefined || context.sampleIds.includes(route.sampleId)) return RENDER
        return redirect({ name: 'samples' })
    }
  }
}
