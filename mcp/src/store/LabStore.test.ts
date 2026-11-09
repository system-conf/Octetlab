import { describe, expect, it } from 'vitest'
import { createEmptyLab } from '../../../src/lab/createLab'
import { ToolError } from '../errors/ToolError'
import { englishMessages } from '../text/EnglishMessages'
import { LAB_ID_PATTERN, LAB_TTL_SECONDS, LabStore } from './LabStore'
import { MemoryKeyValueStore } from './MemoryKeyValueStore'

const NOW = new Date('2026-11-09T10:00:00.000Z')

function storeAt(clock: { now: number }) {
  const kv = new MemoryKeyValueStore(() => clock.now)
  return { kv, labs: new LabStore(kv, englishMessages, () => new Date(clock.now)) }
}

describe('LabStore', () => {
  it('stores a lab under a random id and reads it back', async () => {
    const { labs } = storeAt({ now: NOW.getTime() })
    const labId = await labs.create(createEmptyLab('Office', NOW))
    expect(labId).toMatch(LAB_ID_PATTERN)
    const doc = await labs.load(labId)
    expect(doc.meta.title).toBe('Office')
    expect(doc.meta.updatedAt).toBe(NOW.toISOString())
    expect(await labs.create(createEmptyLab('Other', NOW))).not.toBe(labId)
  })

  it('forgets a lab after the TTL; every save renews it', async () => {
    const clock = { now: NOW.getTime() }
    const { labs } = storeAt(clock)
    const labId = await labs.create(createEmptyLab('Office', NOW))
    clock.now += (LAB_TTL_SECONDS - 60) * 1000
    await labs.save(labId, await labs.load(labId))
    clock.now += (LAB_TTL_SECONDS - 60) * 1000
    await expect(labs.load(labId)).resolves.toMatchObject({ meta: { title: 'Office' } })
    clock.now += 120 * 1000
    await expect(labs.load(labId)).rejects.toMatchObject({ kind: 'notFound' })
  })

  it('refuses malformed ids and reports unreadable stored text as unexpected', async () => {
    const { kv, labs } = storeAt({ now: NOW.getTime() })
    await expect(labs.load('../etc')).rejects.toBeInstanceOf(ToolError)
    await kv.put('lab:AAAAAAAAAAAAAAAAAAAAAA', '{"broken":true}', 60)
    const failure = labs.load('AAAAAAAAAAAAAAAAAAAAAA')
    await expect(failure).rejects.toThrow(/failed validation/)
    await expect(failure).rejects.not.toBeInstanceOf(ToolError)
  })
})
