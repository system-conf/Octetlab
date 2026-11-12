import { describe, expect, it } from 'vitest'
import { createEmptyLab } from '../../../src/lab/createLab'
import { labSerializer } from '../../../src/lab/LabSerializer'
import type { LiveEventDraft } from '../live/LiveEvent'
import { LiveLinks } from '../live/LiveLinks'
import type { LabRoomClient, LabRooms } from '../live/LabRooms'
import { MemoryLabRooms } from '../live/MemoryLabRooms'
import { LabStore } from '../store/LabStore'
import { MemoryKeyValueStore } from '../store/MemoryKeyValueStore'
import { englishMessages } from '../text/EnglishMessages'
import { ToolResponder } from './ToolResponder'

const NOW = new Date('2026-11-12T10:00:00.000Z')
const OTHER: LiveEventDraft = { at: NOW.toISOString(), actor: 'assistant', tool: 'other', summary: 'Other.', deviceIds: [], linkIds: [] }

/** Rooms where another request saves the lab right before each of the next `times` writes. */
class InterferingRooms implements LabRooms {
  readonly inner = new MemoryLabRooms(() => NOW.getTime())
  times = 0

  room(labId: string): LabRoomClient {
    const room = this.inner.room(labId)
    return {
      create: (docText, event) => room.create(docText, event),
      read: () => room.read(),
      snapshot: () => room.snapshot(),
      note: (event) => room.note(event),
      write: async (docText, expectedVersion, event) => {
        if (this.times > 0) {
          this.times--
          const current = await room.read()
          if (current === null) throw new Error('room vanished')
          const doc = JSON.parse(current.docText) as { meta: { title: string } }
          await room.write(JSON.stringify({ ...doc, meta: { ...doc.meta, title: `${doc.meta.title}+other` } }), current.version, OTHER)
        }
        return room.write(docText, expectedVersion, event)
      },
    }
  }

  connect(labId: string, request: Request): Promise<Response> {
    return this.inner.connect(labId, request)
  }
}

async function setup() {
  const rooms = new InterferingRooms()
  const labs = new LabStore({ rooms, legacy: new MemoryKeyValueStore(), messages: englishMessages, now: () => NOW })
  const responder = new ToolResponder(labs, new LiveLinks('https://app.test/'), () => NOW)
  const labId = await labs.create(createEmptyLab('Lab', NOW), responder.event('create_lab', { summary: 'Created.', deviceIds: [], linkIds: [] }))
  return { rooms, labs, responder, labId }
}

describe('ToolResponder.withLab', () => {
  it('re-applies the change once when another call wrote in between', async () => {
    const { rooms, responder, labId, labs } = await setup()
    rooms.times = 1
    const seen: string[] = []
    const result = await responder.withLab(
      labId,
      'test',
      (doc) => {
        seen.push(doc.meta.title)
        return { doc: { ...doc, meta: { ...doc.meta, title: `${doc.meta.title}+mine` } } }
      },
      () => ({ summary: 'Mine.', deviceIds: [], linkIds: [] }),
    )
    expect(seen).toEqual(['Lab', 'Lab+other'])
    expect(result.doc.meta.title).toBe('Lab+other+mine')
    expect(await labs.loadVersioned(labId)).toMatchObject({ version: 3, doc: { meta: { title: 'Lab+other+mine' } } })
    const summaries = (await rooms.inner.room(labId).snapshot())?.events.map((event) => event.summary)
    expect(summaries).toEqual(['Created.', 'Other.', 'Mine.'])
  })

  it('gives up with a conflict error after the retry and saves nothing of its own', async () => {
    const { rooms, responder, labId } = await setup()
    rooms.times = 2
    const attempt = responder.withLab(labId, 'test', (doc) => ({ doc: { ...doc, meta: { ...doc.meta, title: 'mine' } } }), () => ({ summary: 'Mine.', deviceIds: [], linkIds: [] }))
    await expect(attempt).rejects.toMatchObject({ kind: 'conflict' })
    const stored = await rooms.inner.room(labId).read()
    expect(labSerializer.parse(stored?.docText ?? '')).toMatchObject({ ok: true, doc: { meta: { title: 'Lab+other+other' } } })
  })

  it('notes a call that changed nothing instead of writing', async () => {
    const { rooms, responder, labId } = await setup()
    await responder.withLab(labId, 'run_command', (doc) => ({ doc }), () => ({ summary: 'Ran.', deviceIds: [], linkIds: [] }))
    const snapshot = await rooms.inner.room(labId).snapshot()
    expect(snapshot?.version).toBe(1)
    expect(snapshot?.events.at(-1)).toMatchObject({ tool: 'run_command', summary: 'Ran.', version: 1 })
  })

  it('adds liveUrl for results about a lab', async () => {
    const { responder } = await setup()
    const ok = await responder.respond('t', () => ({ text: 'ok', labId: 'L', structured: { a: 1 } }))
    expect(ok.structuredContent).toEqual({ a: 1, liveUrl: 'https://app.test/live/L' })
  })
})
