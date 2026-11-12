import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveLabConnection, MAX_RETRY_MS, PING_INTERVAL_MS, type LiveLabSignal } from './LiveLabConnection'
import { LiveLabEndpoints } from './LiveLabEndpoints'
import { docText, fakeTransport, flushPromises, httpResponse, liveEvent, liveLab, type FakeTransport } from './testLiveFakes'

const LAB_ID = 'AbCdEfGhIjKlMnOpQrStUv'

function setup(): { transport: FakeTransport; signals: LiveLabSignal[]; connection: LiveLabConnection } {
  const transport = fakeTransport()
  const signals: LiveLabSignal[] = []
  const connection = new LiveLabConnection(LAB_ID, (signal) => signals.push(signal), transport.deps)
  connection.start()
  return { transport, signals, connection }
}

const statuses = (signals: readonly LiveLabSignal[]) => signals.flatMap((signal) => (signal.type === 'status' ? [signal.status] : []))
const documents = (signals: readonly LiveLabSignal[]) => signals.flatMap((signal) => (signal.type === 'document' ? [signal] : []))

describe('LiveLabEndpoints', () => {
  it('builds the HTTP and WebSocket URLs on the same host', () => {
    const endpoints = new LiveLabEndpoints('https://mcp.example')
    expect(endpoints.documentUrl(LAB_ID)).toBe(`https://mcp.example/live/${LAB_ID}`)
    expect(endpoints.socketUrl(LAB_ID)).toBe(`wss://mcp.example/live/${LAB_ID}/socket`)
    expect(new LiveLabEndpoints('http://localhost:8791').socketUrl(LAB_ID)).toBe(`ws://localhost:8791/live/${LAB_ID}/socket`)
    expect(() => new LiveLabEndpoints('ftp://mcp.example')).toThrow()
  })
})

describe('LiveLabConnection', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('connects, applies the snapshot and goes live', () => {
    const { transport, signals } = setup()
    expect(transport.last().url).toBe(`wss://live.example/live/${LAB_ID}/socket`)
    expect(statuses(signals)).toEqual(['connecting'])
    transport.last().handlers.open()
    transport.last().receive({ type: 'snapshot', version: 3, doc: docText(), events: [liveEvent({ version: 3 })] })
    expect(documents(signals).map((signal) => signal.version)).toEqual([3])
    expect(documents(signals)[0]?.doc.state.devices.length).toBe(liveLab().state.devices.length)
    expect(signals).toContainEqual({ type: 'events', events: [liveEvent({ version: 3 })], fresh: false })
    expect(statuses(signals)).toEqual(['connecting', 'live'])
  })

  it('applies newer updates, ignores stale versions and passes events on as fresh', () => {
    const { transport, signals } = setup()
    const socket = transport.last()
    socket.receive({ type: 'snapshot', version: 2, doc: docText(liveLab(['router'])), events: [] })
    socket.receive({ type: 'update', version: 3, doc: docText(), event: liveEvent({ version: 3 }) })
    socket.receive({ type: 'update', version: 3, doc: docText(liveLab(['pc'])), event: liveEvent({ version: 3, summary: 'again' }) })
    socket.receive({ type: 'update', version: 1, doc: docText(liveLab(['pc'])), event: null })
    socket.receive({ type: 'event', event: liveEvent({ version: 3, tool: 'run_command', deviceIds: [] }) })
    expect(documents(signals).map((signal) => signal.version)).toEqual([2, 3])
    const fresh = signals.flatMap((signal) => (signal.type === 'events' && signal.fresh ? signal.events : []))
    expect(fresh.map((event) => event.tool)).toEqual(['add_device', 'run_command'])
  })

  it('keeps the last good document when a newer one is invalid', () => {
    const { transport, signals, connection } = setup()
    transport.last().receive({ type: 'snapshot', version: 2, doc: docText(), events: [] })
    transport.last().receive({ type: 'update', version: 3, doc: '{"schemaVersion":2,"broken":true}', event: null })
    expect(documents(signals).map((signal) => signal.version)).toEqual([2])
    expect(signals.some((signal) => signal.type === 'invalidDocument' && signal.version === 3)).toBe(true)
    expect(connection.currentVersion).toBe(2)
  })

  it('ignores malformed messages', () => {
    const { transport, signals } = setup()
    transport.last().handlers.message('not json')
    transport.last().receive({ type: 'update', version: 'x' })
    transport.last().receive({ type: 'surprise' })
    expect(signals.filter((signal) => signal.type !== 'status')).toEqual([])
  })

  it('pings every 25 s while the socket is open', () => {
    const { transport } = setup()
    transport.last().handlers.open()
    transport.clock.advance(PING_INTERVAL_MS * 2)
    expect(transport.last().sent).toEqual(['{"type":"ping"}', '{"type":"ping"}'])
    transport.last().receive({ type: 'pong' })
  })

  it('reconnects with backoff after a drop, catching up through GET first', async () => {
    const { transport, signals } = setup()
    transport.last().receive({ type: 'snapshot', version: 2, doc: docText(liveLab(['router'])), events: [] })
    transport.last().handlers.close()
    expect(statuses(signals).at(-1)).toBe('reconnecting')
    expect(transport.clock.pending).toEqual([1000])

    transport.responses.push('offline')
    transport.clock.advance(1000)
    await flushPromises()
    expect(transport.requests).toEqual([`https://live.example/live/${LAB_ID}`])
    expect(transport.clock.pending).toEqual([2000])

    transport.responses.push(httpResponse(200, { labId: LAB_ID, version: 4, doc: docText(), events: [liveEvent({ version: 4 })] }))
    transport.clock.advance(2000)
    await flushPromises()
    expect(documents(signals).map((signal) => signal.version)).toEqual([2, 4])
    expect(transport.sockets).toHaveLength(2)
    transport.last().receive({ type: 'snapshot', version: 4, doc: docText(), events: [] })
    expect(statuses(signals).at(-1)).toBe('live')
  })

  it('caps the backoff at 30 s', async () => {
    const { transport } = setup()
    const delays: number[] = []
    for (let attempt = 0; attempt < 7; attempt += 1) {
      transport.last().handlers.close()
      const delay = transport.clock.pending[0] ?? 0
      delays.push(delay)
      transport.responses.push(httpResponse(503))
      transport.clock.advance(delay)
      await flushPromises()
      if (transport.clock.pending.length > 0) {
        const retry = transport.clock.pending[0] ?? 0
        transport.responses.push(httpResponse(200, { labId: LAB_ID, version: 1, doc: docText(), events: [] }))
        transport.clock.advance(retry)
        await flushPromises()
      }
    }
    expect(Math.max(...delays)).toBe(MAX_RETRY_MS)
    expect(delays.slice(0, 2)).toEqual([1000, 4000])
  })

  it('ends for good when the lab expired or is not found', async () => {
    const expired = setup()
    expired.transport.last().receive({ type: 'snapshot', version: 2, doc: docText(), events: [] })
    expired.transport.last().receive({ type: 'expired' })
    expect(statuses(expired.signals).at(-1)).toBe('ended')
    expect(expired.transport.last().closed).toBe(true)
    expect(expired.transport.clock.pending).toEqual([])

    const missing = setup()
    missing.transport.last().handlers.close()
    expect(statuses(missing.signals)).toEqual(['connecting'])
    missing.transport.responses.push(httpResponse(404))
    missing.transport.clock.advance(1000)
    await flushPromises()
    expect(statuses(missing.signals).at(-1)).toBe('notFound')
    expect(missing.transport.sockets).toHaveLength(1)
  })

  it('reports a refused origin as an error', async () => {
    const { transport, signals } = setup()
    transport.last().handlers.close()
    transport.responses.push(httpResponse(403))
    transport.clock.advance(1000)
    await flushPromises()
    expect(statuses(signals).at(-1)).toBe('error')
  })

  it('stops silently: no reconnect, no signals', () => {
    const { transport, signals, connection } = setup()
    transport.last().handlers.open()
    connection.stop()
    const count = signals.length
    transport.last().handlers.close()
    transport.last().receive({ type: 'snapshot', version: 2, doc: docText(), events: [] })
    transport.clock.advance(60_000)
    expect(signals).toHaveLength(count)
    expect(transport.last().closed).toBe(true)
    expect(transport.last().sent).toEqual([])
  })
})
