import { describe, expect, it } from 'vitest'
import enExercises from '../locales/en/exercises.json'
import trExercises from '../locales/tr/exercises.json'
import type { ExerciseDefinition } from '../domain'
import { exerciseDefinitions } from './exerciseDefinitions'

const textsByLanguage: [string, unknown][] = [
  ['tr', trExercises],
  ['en', enExercises],
]

/** Value at a dot path of parsed JSON, or undefined when any segment is missing. */
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    const next: unknown = Reflect.get(current, segment)
    return next
  }, value)
}

function expectText(value: unknown, path: string): void {
  expect(typeof value, path).toBe('string')
  expect(String(value).trim(), path).not.toBe('')
}

function expectTextList(value: unknown, path: string): unknown[] {
  expect(Array.isArray(value), path).toBe(true)
  const items: unknown[] = Array.isArray(value) ? value : []
  items.forEach((item, index) => expectText(item, `${path}.${index}`))
  return items
}

/** Keys of a JSON object (sorted), [] when absent; non-empty string values are checked too. */
function textKeys(value: unknown, path: string): string[] {
  if (value === undefined) return []
  expect(typeof value === 'object' && value !== null && !Array.isArray(value), path).toBe(true)
  const entries = typeof value === 'object' && value !== null ? Object.entries(value) : []
  entries.forEach(([key, text]) => expectText(text, `${path}.${key}`))
  return entries.map(([key]) => key).sort()
}

function deviceIds(definition: ExerciseDefinition): string[] {
  return definition.lab.state.devices.map((device) => device.id).sort()
}

function appLinkIds(definition: ExerciseDefinition): string[] {
  const ids = definition.lab.state.devices.flatMap((device) => (device.host?.appLinks ?? []).map((appLink) => appLink.id))
  return [...new Set(ids)].sort()
}

describe.each(textsByLanguage)('exercises.json (%s)', (_language, texts) => {
  it('has texts for exactly the defined exercises', () => {
    const keys = typeof texts === 'object' && texts !== null ? Object.keys(texts).sort() : []
    expect(keys).toEqual(exerciseDefinitions.map((definition) => definition.id).sort())
  })

  it.each(exerciseDefinitions.map((definition): [string, ExerciseDefinition] => [definition.id, definition]))(
    '%s has complete texts',
    (id, definition) => {
      const exercise = at(texts, id)
      for (const path of [
        'title',
        'complaint.from',
        'complaint.message',
        'explanation.whatHappened',
        'explanation.realLife',
        'explanation.interviewAnswer',
      ]) {
        expectText(at(exercise, path), `${id}.${path}`)
      }
      expect(expectTextList(at(exercise, 'hints'), `${id}.hints`)).toHaveLength(3)
      expect(expectTextList(at(exercise, 'topics'), `${id}.topics`).length).toBeGreaterThanOrEqual(1)
      expect(textKeys(at(exercise, 'devices'), `${id}.devices`)).toEqual(deviceIds(definition))
      expect(textKeys(at(exercise, 'appLinks'), `${id}.appLinks`)).toEqual(appLinkIds(definition))
    },
  )
})

describe('exercises.json across languages', () => {
  it.each(exerciseDefinitions.map((definition) => [definition.id]))('%s has the same topic count in tr and en', (id) => {
    const trTopics = at(trExercises, `${id}.topics`)
    const enTopics = at(enExercises, `${id}.topics`)
    expect(Array.isArray(trTopics) && Array.isArray(enTopics)).toBe(true)
    expect(Array.isArray(trTopics) ? trTopics.length : -1).toBe(Array.isArray(enTopics) ? enTopics.length : -2)
  })
})
