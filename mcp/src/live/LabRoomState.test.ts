import { describe, expect, it } from 'vitest'
import { DOC_CHUNK_CHARS, LabRoomState } from './LabRoomState'
import { MAX_ROOM_EVENTS, MAX_ROOM_WATCHERS, PING_MESSAGE, PONG_MESSAGE, ROOM_TTL_MS, eventOutput, type LiveEventDraft } from './LiveEvent'
import { RecordingSocket } from './MemoryLabRooms'
import { MemoryRoomStorage } from './MemoryRoomStorage'

const NOW = Date.parse('2026-11-12T10:00:00.000Z')

function draft(summary: string): LiveEventDraft {
  return { at: new Date(NOW).toISOString(), actor: 'assistant', tool: 'add_device', summary, deviceIds: ['pc1'], linkIds: [] }
}

function room(clock = { now: NOW }) {
  const storage = new MemoryRoomStorage()
  const sockets: RecordingSocket[] = []
  const state = new LabRoomState(storage, () => sockets.filter((socket) => socket.closed === null), () => clock.now)
  return { storage, sockets, state, clock }
}

function parsed(socket: RecordingSocket): Record<string, unknown>[] {
  return socket.sent.map((text) => JSON.parse(text) as Record<string, unknown>)
}

describe('LabRoomState', () => {
  it('creates version 1 once and reads it back with its first event', async () => {
    const { state, storage } = room()
    expect(await state.create('{"a":1}', draft('Created.'))).toEqual({ ok: true, version: 1 })
    expect(await state.create('{"b":2}')).toEqual({ ok: false, reason: 'exists' })
    expect(await state.read()).toEqual({ docText: '{"a":1}', version: 1 })
    const snapshot = await state.snapshot()
    expect(snapshot?.events).toEqual([{ ...draft('Created.'), version: 1 }])
    expect(storage.alarmAt).toBe(NOW + ROOM_TTL_MS)
  })

  it('writes with compare-and-set and pushes the update to every watcher', async () => {
    const { state, sockets } = room()
    await state.create('v1')
    sockets.push(new RecordingSocket(), new RecordingSocket())
    expect(await state.write('v2', 1, draft('Added PC 1.'))).toEqual({ ok: true, version: 2 })
    expect(await state.write('stale', 1, draft('Lost.'))).toEqual({ ok: false, reason: 'conflict' })
    expect(await state.read()).toEqual({ docText: 'v2', version: 2 })
    for (const socket of sockets) {
      expect(parsed(socket)).toEqual([{ type: 'update', version: 2, doc: 'v2', event: { ...draft('Added PC 1.'), version: 2 } }])
    }
  })

  it('reports notFound for writes and notes on an empty room', async () => {
    const { state } = room()
    expect(await state.write('x', 1, draft('x'))).toEqual({ ok: false, reason: 'notFound' })
    expect(await state.note(draft('x'))).toEqual({ ok: false, reason: 'notFound' })
    expect(await state.read()).toBeNull()
  })

  it('notes an event without a change and keeps only the last events', async () => {
    const { state, sockets } = room()
    await state.create('doc')
    const watcher = new RecordingSocket()
    sockets.push(watcher)
    const output = eventOutput('pc1', 'ping 10.0.0.1', ['Reply'])
    expect(await state.note({ ...draft('Ran ping.'), output })).toEqual({ ok: true, version: 1 })
    expect(parsed(watcher)).toEqual([{ type: 'event', event: { ...draft('Ran ping.'), output, version: 1 } }])
    for (let index = 0; index < MAX_ROOM_EVENTS + 5; index++) await state.note(draft(`note ${index}`))
    const events = (await state.snapshot())?.events ?? []
    expect(events).toHaveLength(MAX_ROOM_EVENTS)
    expect(events.at(-1)?.summary).toBe(`note ${MAX_ROOM_EVENTS + 4}`)
  })

  it('stores large documents in chunks and drops chunks it no longer needs', async () => {
    const { state, storage } = room()
    const big = 'x'.repeat(DOC_CHUNK_CHARS * 2 + 10)
    await state.create(big)
    expect(storage.keys()).toEqual(['doc:0', 'doc:1', 'doc:2', 'events', 'meta'])
    expect((await state.read())?.docText).toBe(big)
    await state.write('small', 1, draft('Shrunk.'))
    expect(storage.keys()).toEqual(['doc:0', 'events', 'meta'])
    expect((await state.read())?.docText).toBe('small')
  })

  it('expires after the TTL: storage deleted, watchers told and closed', async () => {
    const { state, storage, sockets, clock } = room()
    await state.create('doc')
    clock.now += ROOM_TTL_MS - 1000
    await state.write('doc2', 1, draft('Renewed.'))
    clock.now += ROOM_TTL_MS - 1000
    await state.alarm()
    expect(await state.read()).toEqual({ docText: 'doc2', version: 2 })
    const watcher = new RecordingSocket()
    sockets.push(watcher)
    clock.now += 2000
    await state.alarm()
    expect(storage.keys()).toEqual([])
    expect(storage.alarmAt).toBeNull()
    expect(parsed(watcher)).toEqual([{ type: 'expired' }])
    expect(watcher.closed).toEqual({ code: 1000, reason: 'Lab expired' })
    expect(await state.read()).toBeNull()
  })

  it('treats an expired room as not found even before the alarm ran', async () => {
    const { state, clock } = room()
    await state.create('doc')
    clock.now += ROOM_TTL_MS
    expect(await state.snapshot()).toBeNull()
  })

  it('admits watchers up to the limit with a snapshot', async () => {
    const { state, sockets } = room()
    expect(await state.admit()).toMatchObject({ ok: false, status: 404 })
    await state.create('doc', draft('Created.'))
    const admitted = await state.admit()
    if (!admitted.ok) throw new Error('not admitted')
    expect(JSON.parse(admitted.snapshot)).toEqual({ type: 'snapshot', version: 1, doc: 'doc', events: [{ ...draft('Created.'), version: 1 }] })
    for (let index = 0; index < MAX_ROOM_WATCHERS; index++) sockets.push(new RecordingSocket())
    expect(await state.admit()).toMatchObject({ ok: false, status: 429 })
  })

  it('answers pings, ignores other messages and closes on oversized ones', () => {
    const { state } = room()
    const socket = new RecordingSocket()
    state.message(socket, PING_MESSAGE)
    state.message(socket, '{"type":"edit"}')
    expect(socket.sent).toEqual([PONG_MESSAGE])
    state.message(socket, 'x'.repeat(1025))
    expect(socket.closed).toEqual({ code: 1009, reason: 'Message too large' })
  })

  it('caps run_command output in events', () => {
    const lines = Array.from({ length: 250 }, (_, index) => `line ${index}`)
    const output = eventOutput('r1', 'show run', lines)
    expect(output.lines).toHaveLength(200)
    expect(output.lines.at(-1)).toBe('… (51 more lines)')
  })
})
