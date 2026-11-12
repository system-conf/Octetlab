import { lazy, Suspense, useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'
import { AppRouteCodec, RouteResolver, routes, ShareHashWatcher, useAppRoute, useAppRouter } from '../../routing'
import { useExerciseSummaries } from '../../scenarios/exerciseSummaries'
import { ProgressStore } from '../../session/ProgressStore'
import type { SolvedExercise } from '../exercise/ExerciseScreen'
import LandingScreen from '../landing/LandingScreen'
import ExerciseListScreen from '../scenario/ExerciseListScreen'
import ExerciseReport from './ExerciseReport'
import LoadingScreen from './LoadingScreen'

// The workspace and exercise screens (React Flow, engine, catalog, lab storage) load on demand.
const LabWorkspaceScreen = lazy(() => import('../workspace/LabWorkspaceScreen'))
const ExerciseScreen = lazy(() => import('../exercise/ExerciseScreen'))
// Design (D2): brief list, design mode and review load on demand (briefs, checker, catalog).
const DesignRoutes = lazy(() => import('../design/DesignRoutes'))
// SL1 (sample labs): sample list and sample lessons load on demand (samples, checker, workspace).
const SampleRoutes = lazy(() => import('../samples/SampleRoutes'))
// PU (Preferences screen): loads on demand.
const PreferencesScreen = lazy(() => import('../preferences/PreferencesScreen'))
// Live labs (docs/LIVE_LABS.md §8): loads on demand (workspace, WebSocket connection).
const LiveLabScreen = lazy(() => import('../live/LiveLabScreen'))

/** Picks the screen for the current route; redirects through RouteResolver. */
function AppRoutes() {
  const router = useAppRouter()
  const route = useAppRoute()
  const { language } = useLanguage()
  const exercises = useExerciseSummaries()
  const [progressStore] = useState(() => ProgressStore.fromBrowser())
  const [progress, setProgress] = useState(() => progressStore.read())
  const [solved, setSolved] = useState<SolvedExercise | null>(null)
  const [shareWatcher] = useState(() => ShareHashWatcher.browser())
  // `#lab=…` the page was opened with; later a link pasted into the open tab (hashchange).
  const [shareHash, setShareHash] = useState(() => shareWatcher.current())

  // A pasted share link goes the same way as on load: RouteResolver forwards it to /lab, the
  // workspace opens it, clears the hash and reports errors in a toast.
  useEffect(() => shareWatcher.watch(setShareHash), [shareWatcher])

  const decision = RouteResolver.resolve(route, {
    exerciseIds: exercises.map((exercise) => exercise.id),
    reportExerciseId: solved?.exerciseId ?? null,
    hasShareHash: shareHash !== null,
  })
  const redirect = decision.kind === 'redirect' ? decision : null
  const redirectUrl = redirect ? AppRouteCodec.format(redirect.to) : null

  useEffect(() => {
    if (redirect) router.navigate(redirect.to, { replace: true, keepHash: redirect.keepHash })
    // redirectUrl identifies the redirect; the decision object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectUrl, router])

  // `?lang=` in the address bar follows a language switch (it would win on reload otherwise).
  useEffect(() => {
    router.updateQueryParameter('lang', language)
  }, [language, router])

  // Every screen starts at the top, not at the scroll position of the previous one.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  if (redirect) return null

  switch (route.name) {
    case 'landing':
    case 'notFound':
      return <LandingScreen />
    case 'lab':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <LabWorkspaceScreen shareHash={shareHash} onShareHashUsed={() => setShareHash(null)} />
        </Suspense>
      )
    case 'exercises':
      return (
        <ExerciseListScreen
          items={exercises.map((exercise) => ({
            id: exercise.id,
            order: exercise.order,
            title: exercise.texts.title,
            setting: exercise.setting,
            topics: exercise.texts.topics,
            completed: progress[exercise.id] !== undefined,
          }))}
          onStart={(exerciseId) => router.navigate(routes.exercise(exerciseId))}
        />
      )
    case 'exercise':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <ExerciseScreen
            key={route.exerciseId}
            exerciseId={route.exerciseId}
            onSolved={(result) => {
              setProgress(progressStore.recordCompletion(result.exerciseId, result.guideStepsUsed))
              setSolved(result)
              router.navigate(routes.exerciseReport(result.exerciseId))
            }}
          />
        </Suspense>
      )
    case 'exerciseReport': {
      const index = exercises.findIndex((exercise) => exercise.id === route.exerciseId)
      const exercise = exercises[index]
      if (!exercise || !solved) return null
      return <ExerciseReport solved={solved} exercise={exercise} next={exercises[index + 1]} />
    }
    // Design (D2): one lazy module for the three design routes (it keeps drafts across them).
    case 'designs':
    case 'design':
    case 'designReview':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <DesignRoutes route={route} />
        </Suspense>
      )
    // SL1 (sample labs): one lazy module for the list and the sample lessons.
    case 'samples':
    case 'sample':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <SampleRoutes route={route} />
        </Suspense>
      )
    // PU (Preferences screen)
    case 'preferences':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <PreferencesScreen />
        </Suspense>
      )
    // Live labs
    case 'live':
      return (
        <Suspense fallback={<LoadingScreen />}>
          <LiveLabScreen key={route.labId} labId={route.labId} />
        </Suspense>
      )
  }
}

export default AppRoutes
