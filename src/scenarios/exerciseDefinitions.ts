// Every exercise as a v2 ExerciseDefinition: the first five are v1 data migrated with migrateV1Exercise
// until they are rewritten as v2 data (PLAN_V2 wave 2.2); the pack 5.2 ones are v2 data (src/scenarios/security,
// which builds its labs with the design LabBuilder). Imported by the exercise screen only
// (lazy chunk), so the migration code stays out of the landing chunk.
import type { ExerciseDefinition, ExerciseLock } from '../domain'
import { migrateV1Exercise } from '../lab/migrations'
import { scenarioDefinitions } from './scenarioDefinitions'
import { securityExercises } from './security'

/**
 * Locks of every v1 exercise: like in v1 the network is given — devices and cables cannot be
 * added, deleted or moved; settings, power, plugging cables and the terminal stay free.
 */
export const V1_EXERCISE_LOCKS: readonly ExerciseLock[] = [{ scope: 'topology' }]

const migratedExercises: readonly ExerciseDefinition[] = scenarioDefinitions.map((definition) => {
  const migrated = migrateV1Exercise(definition)
  return { ...migrated, locks: [...migrated.locks, ...V1_EXERCISE_LOCKS] }
})

/** Every exercise, sorted by order: the migrated v1 five, then the pack 5.2 exercises written as v2 data. */
export const exerciseDefinitions: readonly ExerciseDefinition[] = [...migratedExercises, ...securityExercises].sort((first, second) => first.order - second.order)
