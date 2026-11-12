import { describe, expect, it } from 'vitest'
import { FakeClock, liveEvent, liveLab } from '../../../live/testLiveFakes'
import { HIGHLIGHT_MS, INITIAL_LIVE_STATE, LiveLabStore } from './LiveLabStore'

function setup() {
  const clock = new FakeClock()
  const store = new LiveLabStore(clock)
  let changes = 0
  store.subscribe(() => {
    changes += 1
  })
  return { clock, store, changes: () => changes }
}

describe('LiveLabStore', () => {
  it('starts connecting without a document', () => {
    expect(new LiveLabStore(new FakeClock()).getSnapshot()).toEqual(INITIAL_LIVE_STATE)
  })

  it('follows the status and keeps only newer documents', () => {
    const { store, changes } = setup()
    store.receive({ type: 'status', status: 'live' })
    store.receive({ type: 'document', doc: liveLab(), version: 3 })
    store.receive({ type: 'document', doc: liveLab(['pc']), version: 2 })
    const state = store.getSnapshot()
    expect(state.status).toBe('live')
    expect(state.version).toBe(3)
    expect(state.doc?.state.devices.some((device) => device.id === 'pc')).toBe(true)
    expect(changes()).toBe(2)
  })

  it('lists events newest first without duplicates', () => {
    const { store } = setup()
    store.receive({ type: 'events', events: [liveEvent({ version: 1, summary: 'one' }), liveEvent({ version: 2, summary: 'two' })], fresh: false })
    store.receive({ type: 'events', events: [liveEvent({ version: 2, summary: 'two' }), liveEvent({ version: 3, summary: 'three' })], fresh: false })
    store.receive({ type: 'events', events: [liveEvent({ version: 3, at: '2026-11-12T10:05:00.000Z', summary: 'note' })], fresh: true })
    expect(store.getSnapshot().events.map((event) => event.summary)).toEqual(['note', 'three', 'two', 'one'])
  })

  it('highlights fresh changes for 2.5 s, merging bursts', () => {
    const { store, clock } = setup()
    store.receive({ type: 'events', events: [liveEvent({ version: 1, deviceIds: ['pc'] })], fresh: false })
    expect(store.getSnapshot().highlight).toBeNull()
    store.receive({ type: 'events', events: [liveEvent({ version: 2, deviceIds: ['router'] })], fresh: true })
    clock.advance(1000)
    store.receive({ type: 'events', events: [liveEvent({ version: 3, deviceIds: ['sw'], linkIds: ['link2'] })], fresh: true })
    expect(store.getSnapshot().highlight).toMatchObject({ deviceIds: ['router', 'sw'], linkIds: ['link2'] })
    clock.advance(HIGHLIGHT_MS - 1)
    expect(store.getSnapshot().highlight).not.toBeNull()
    clock.advance(1)
    expect(store.getSnapshot().highlight).toBeNull()
  })

  it('records an invalid document as a new problem each time', () => {
    const { store } = setup()
    store.receive({ type: 'invalidDocument', version: 4, errors: [] })
    const first = store.getSnapshot().problem?.key
    store.receive({ type: 'invalidDocument', version: 5, errors: [] })
    expect(store.getSnapshot().problem?.version).toBe(5)
    expect(store.getSnapshot().problem?.key).not.toBe(first)
  })

  it('cancels the highlight timer on clearTimers', () => {
    const { store, clock } = setup()
    store.receive({ type: 'events', events: [liveEvent({ deviceIds: ['pc'] })], fresh: true })
    store.clearTimers()
    expect(clock.pending).toEqual([])
  })
})
