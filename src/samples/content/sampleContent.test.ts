// The first sample batch (docs/SAMPLE_LABS.md, SL2): structure, catalogue coverage and texts in tr + en.
import { describe, expect, it } from 'vitest'
import { StateInvariants } from '../../domain'
import enSamples from '../../locales/en/samples.json'
import trSamples from '../../locales/tr/samples.json'
import { designExercises } from '../../scenarios/design'
import { exerciseDefinitions } from '../../scenarios/exerciseDefinitions'
import { openSampleLab, SAMPLE_CATEGORIES, SampleCatalog, SampleTextKeys, SampleValidator } from '../contract'
import { sampleDefinitions } from '../sampleDefinitions'
import { contentSamples } from './index'

const LOCALES: Readonly<Record<string, unknown>> = { en: enSamples, tr: trSamples }

/** Value at a `samples:a.b.c` key in a parsed locale file (undefined when missing). */
function valueAt(locale: unknown, key: string): unknown {
  const path = key.replace(/^samples:/, '').split('.')
  return path.reduce<unknown>((node, segment) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[segment] : undefined), locale)
}

describe('sample content', () => {
  it('is listed in sampleDefinitions and passes the validator', () => {
    expect(sampleDefinitions.map((sample) => sample.id)).toEqual(contentSamples.map((sample) => sample.id))
    const validator = new SampleValidator({
      exerciseIds: exerciseDefinitions.map((exercise) => exercise.id),
      briefIds: designExercises.map((brief) => brief.id),
    })
    expect(validator.validateAll(sampleDefinitions)).toEqual([])
  })

  it('covers every "now", Phase 3 and pack 5.2 category, and every sample is available in the catalogue', () => {
    const catalog = new SampleCatalog(sampleDefinitions)
    const shipped = SAMPLE_CATEGORIES.filter((category) => category.delivery === 'now' || category.delivery === 'phase3' || category.delivery === 'pack5.2').map((category) => category.id)
    expect(catalog.byCategory().map((group) => group.category.id)).toEqual(shipped)
    expect(catalog.available().map((sample) => sample.id).sort()).toEqual(contentSamples.map((sample) => sample.id).sort())
    const counts = Object.fromEntries(catalog.byCategory().map((group) => [group.category.id, group.samples.length]))
    expect(counts).toEqual({ basics: 5, dhcp: 5, dns: 3, switching: 6, routing: 3, packetView: 3, security: 3 })
  })

  it.each(contentSamples.map((sample) => [sample.id, sample] as const))('%s opens as a valid lab with final hostnames', (_, sample) => {
    const lab = openSampleLab(sample, { title: sample.id })
    expect(new StateInvariants().violations(lab.state)).toEqual([])
    expect(lab.meta.title).toBe(sample.id)
    for (const device of lab.state.devices) {
      expect(device.name, device.id).toMatch(/^[A-Z][A-Z0-9-]*$/)
      expect(lab.layout.devices[device.id], device.id).toBeDefined()
    }
  })

  it.each(Object.keys(LOCALES))('has every lesson text in %s', (language) => {
    const locale = LOCALES[language]
    for (const sample of contentSamples) {
      for (const key of SampleTextKeys.stringKeys(sample)) {
        const value = valueAt(locale, key)
        expect(typeof value === 'string' && value.trim() !== '', `${language} ${key}`).toBe(true)
      }
      const topics = valueAt(locale, SampleTextKeys.topics(sample.id))
      expect(Array.isArray(topics) && topics.length > 0 && topics.every((topic) => typeof topic === 'string' && topic !== ''), `${language} ${sample.id} topics`).toBe(true)
    }
  })

  it('has no lesson texts for samples that do not exist, and the same topic count in tr and en', () => {
    const ids = contentSamples.map((sample) => sample.id).sort()
    expect(Object.keys(enSamples.labs).sort()).toEqual(ids)
    expect(Object.keys(trSamples.labs).sort()).toEqual(ids)
    for (const id of ids) {
      expect(valueAt(trSamples, SampleTextKeys.topics(id)), id).toHaveLength((valueAt(enSamples, SampleTextKeys.topics(id)) as unknown[]).length)
    }
  })
})
