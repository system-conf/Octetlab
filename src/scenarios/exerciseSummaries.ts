// Light exercise metadata for the exercise list and the solution report (main chunk): ids, order and
// setting without the networks' migration or lab building. Texts come from the `exercises` namespace.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExerciseSetting, ExerciseTexts } from '../domain'
import { V1_SETTING_MAP } from '../lab/migrations/v1DeviceMap'
import { ExerciseTextReader } from './ExerciseTextReader'
import { scenarioDefinitions } from './scenarioDefinitions'
import { SECURITY_EXERCISE_INDEX } from './security/securityExerciseIndex'

export interface ExerciseSummary {
  id: string
  order: number
  setting: ExerciseSetting
  texts: ExerciseTexts
}

/** Every exercise (sorted by order) with its texts in the active language. */
export function useExerciseSummaries(): ExerciseSummary[] {
  const { t } = useTranslation('exercises')
  return useMemo(() => {
    const reader = new ExerciseTextReader(t)
    const metas = [
      ...scenarioDefinitions.map((definition) => ({ id: definition.id, order: definition.order, setting: V1_SETTING_MAP[definition.setting] })),
      ...SECURITY_EXERCISE_INDEX,
    ].sort((first, second) => first.order - second.order)
    return metas.map((meta) => ({ ...meta, texts: reader.texts(meta.id) }))
  }, [t])
}
