import { describe, expect, it } from 'vitest'
import { RouteResolver, type RouteContext } from './RouteResolver'

const context: RouteContext = {
  exerciseIds: ['posGateway', 'wrongDns'],
  reportExerciseId: null,
  hasShareHash: false,
  briefIds: ['smallOffice', 'restaurant'],
  reviewBriefId: null,
}

describe('RouteResolver', () => {
  it('renders the known screens', () => {
    for (const route of [{ name: 'landing' }, { name: 'lab' }, { name: 'exercises' }, { name: 'designs' }, { name: 'preferences' }] as const) {
      expect(RouteResolver.resolve(route, context)).toEqual({ kind: 'render' })
    }
    expect(RouteResolver.resolve({ name: 'exercise', exerciseId: 'wrongDns' }, context)).toEqual({ kind: 'render' })
    expect(RouteResolver.resolve({ name: 'design', briefId: 'restaurant' }, context)).toEqual({ kind: 'render' })
    expect(RouteResolver.resolve({ name: 'live', labId: 'AbCdEfGhIjKlMnOpQrStUv' }, context)).toEqual({ kind: 'render' })
  })

  it('sends unknown paths to the landing page', () => {
    expect(RouteResolver.resolve({ name: 'notFound', path: '/x' }, context)).toEqual({
      kind: 'redirect',
      to: { name: 'landing' },
      keepHash: false,
    })
  })

  it('sends unknown exercises to the list', () => {
    expect(RouteResolver.resolve({ name: 'exercise', exerciseId: 'ghost' }, context)).toMatchObject({ to: { name: 'exercises' } })
    expect(RouteResolver.resolve({ name: 'exerciseReport', exerciseId: 'ghost' }, context)).toMatchObject({ to: { name: 'exercises' } })
  })

  it('shows a report only right after a verified attempt of that exercise', () => {
    const report = { name: 'exerciseReport', exerciseId: 'posGateway' } as const
    expect(RouteResolver.resolve(report, context)).toEqual({
      kind: 'redirect',
      to: { name: 'exercise', exerciseId: 'posGateway' },
      keepHash: false,
    })
    expect(RouteResolver.resolve(report, { ...context, reportExerciseId: 'wrongDns' })).toMatchObject({ kind: 'redirect' })
    expect(RouteResolver.resolve(report, { ...context, reportExerciseId: 'posGateway' })).toEqual({ kind: 'render' })
  })

  it('sends unknown design briefs to the brief list', () => {
    expect(RouteResolver.resolve({ name: 'design', briefId: 'ghost' }, context)).toMatchObject({ to: { name: 'designs' } })
    expect(RouteResolver.resolve({ name: 'designReview', briefId: 'ghost' }, context)).toMatchObject({ to: { name: 'designs' } })
  })

  it('shows a design review only for the brief whose design was just submitted', () => {
    const review = { name: 'designReview', briefId: 'smallOffice' } as const
    expect(RouteResolver.resolve(review, context)).toEqual({
      kind: 'redirect',
      to: { name: 'design', briefId: 'smallOffice' },
      keepHash: false,
    })
    expect(RouteResolver.resolve(review, { ...context, reviewBriefId: 'restaurant' })).toMatchObject({ kind: 'redirect' })
    expect(RouteResolver.resolve(review, { ...context, reviewBriefId: 'smallOffice' })).toEqual({ kind: 'render' })
  })

  // SL1 (sample labs)
  it('renders known samples and sends unknown or unavailable ones to the sample list', () => {
    const withSamples: RouteContext = { ...context, sampleIds: ['twoPcsSwitch'] }
    expect(RouteResolver.resolve({ name: 'samples' }, withSamples)).toEqual({ kind: 'render' })
    expect(RouteResolver.resolve({ name: 'sample', sampleId: 'twoPcsSwitch' }, withSamples)).toEqual({ kind: 'render' })
    expect(RouteResolver.resolve({ name: 'sample', sampleId: 'ghost' }, withSamples)).toEqual({
      kind: 'redirect',
      to: { name: 'samples' },
      keepHash: false,
    })
    expect(RouteResolver.resolve({ name: 'sample', sampleId: 'ghost' }, context)).toEqual({ kind: 'render' })
  })

  it('leaves design routes to the design module when the brief ids are not known', () => {
    const appLevel: RouteContext = { exerciseIds: [], reportExerciseId: null, hasShareHash: false }
    expect(RouteResolver.resolve({ name: 'design', briefId: 'anything' }, appLevel)).toEqual({ kind: 'render' })
    expect(RouteResolver.resolve({ name: 'designReview', briefId: 'anything' }, appLevel)).toEqual({ kind: 'render' })
  })

  it('forwards a share hash to the workspace, keeping the hash', () => {
    const shared = { ...context, hasShareHash: true }
    expect(RouteResolver.resolve({ name: 'landing' }, shared)).toEqual({ kind: 'redirect', to: { name: 'lab' }, keepHash: true })
    expect(RouteResolver.resolve({ name: 'design', briefId: 'smallOffice' }, shared)).toMatchObject({ to: { name: 'lab' } })
    expect(RouteResolver.resolve({ name: 'lab' }, shared)).toEqual({ kind: 'render' })
  })
})
