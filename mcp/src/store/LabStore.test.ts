import { describe, expect, it } from 'vitest'
import { createEmptyLab } from '../../../src/lab/createLab'
import { labSerializer } from '../../../src/lab/LabSerializer'
import { ToolError } from '../errors/ToolError'
import type { LiveEventDraft } from '../live/LiveEvent'
import { MemoryLabRooms } from '../live/MemoryLabRooms'
import { englishMessages } from '../text/EnglishMessages'
import { LAB_ID_PATTERN, LAB_TTL_SECONDS, LabStore } from './LabStore'
import { MemoryKeyValueStore } from './MemoryKeyValueStore'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const LEGACY_ID = 'AAAAAAAAAAAAAAAAAAAAAA'

function event(summary: string): LiveEventDraft {
  return { at: NOW.toISOString(), actor: 'assistant', tool: 'test', summary, deviceIds: [], linkIds: [] }
}

function storeAt(clock: { now: number }) {
  const rooms = new MemoryLabRooms(() => clock.now)
  const legacy = new MemoryKeyValueStore(() => clock.now)
  return { rooms, legacy, labs: new LabStore({ rooms, legacy, messages: englishMessages, now: () => new Date(clock.now) }) }
}

describe('LabStore', () => {
  it('stores a lab in its own room under a random id and reads it back', async () => {
    const { labs, rooms } = storeAt({ now: NOW.getTime() })
    const labId = await labs.create(createEmptyLab('Office', NOW), event('Created.'))
    expect(labId).toMatch(LAB_ID_PATTERN)
    const stored = await labs.loadVersioned(labId)
    expect(stored.version).toBe(1)
    expect(stored.doc.meta.title).toBe('Office')
    expect(stored.doc.meta.updatedAt).toBe(NOW.toISOString())
    expect((await rooms.room(labId).snapshot())?.events.map((item) => item.summary)).toEqual(['Created.'])
    expect(await labs.create(createEmptyLab('Other', NOW), event('Created.'))).not.toBe(labId)
  })

  it('saves with compare-and-set on the version', async () => {
    const { labs } = storeAt({ now: NOW.getTime() })
    const labId = await labs.create(createEmptyLab('Office', NOW), event('Created.'))
    const { doc } = await labs.loadVersioned(labId)
    const renamed = { ...doc, meta: { ...doc.meta, title: 'Cafe' } }
    expect(await labs.save(labId, renamed, 1, event('Renamed.'))).toMatchObject({ ok: true, version: 2 })
    expect(await labs.save(labId, doc, 1, event('Stale.'))).toEqual({ ok: false, reason: 'conflict' })
    expect((await labs.load(labId)).meta.title).toBe('Cafe')
  })

  it('falls back to a pre-live lab in KV once and serves it from the room afterwards', async () => {
    const { labs, legacy, rooms } = storeAt({ now: NOW.getTime() })
    await legacy.put(`lab:${LEGACY_ID}`, labSerializer.serializeCompact(createEmptyLab('Old lab', NOW)), LAB_TTL_SECONDS)
    expect(await rooms.room(LEGACY_ID).read()).toBeNull()
    const stored = await labs.loadVersioned(LEGACY_ID)
    expect(stored).toMatchObject({ version: 1, doc: { meta: { title: 'Old lab' } } })
    expect((await rooms.room(LEGACY_ID).read())?.version).toBe(1)
    expect(await labs.save(LEGACY_ID, stored.doc, 1, event('Changed.'))).toMatchObject({ ok: true, version: 2 })
    expect((await labs.loadVersioned(LEGACY_ID)).version).toBe(2)
  })

  it('forgets a lab 7 days after its last change', async () => {
    const clock = { now: NOW.getTime() }
    const { labs } = storeAt(clock)
    const labId = await labs.create(createEmptyLab('Office', NOW), event('Created.'))
    clock.now += (LAB_TTL_SECONDS - 60) * 1000
    const { doc, version } = await labs.loadVersioned(labId)
    await labs.save(labId, doc, version, event('Renewed.'))
    clock.now += (LAB_TTL_SECONDS - 60) * 1000
    await expect(labs.load(labId)).resolves.toMatchObject({ meta: { title: 'Office' } })
    clock.now += 120 * 1000
    await expect(labs.load(labId)).rejects.toMatchObject({ kind: 'notFound' })
    await expect(labs.note(labId, event('Late.'))).rejects.toMatchObject({ kind: 'notFound' })
  })

  it('refuses malformed ids and reports unreadable stored text as unexpected', async () => {
    const { legacy, labs } = storeAt({ now: NOW.getTime() })
    await expect(labs.load('../etc')).rejects.toBeInstanceOf(ToolError)
    await legacy.put(`lab:${LEGACY_ID}`, '{"broken":true}', 60)
    const failure = labs.load(LEGACY_ID)
    await expect(failure).rejects.toThrow(/failed validation/)
    await expect(failure).rejects.not.toBeInstanceOf(ToolError)
  })
})
