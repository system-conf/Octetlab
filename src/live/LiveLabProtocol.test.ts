import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveLabProtocol, MAX_OUTPUT_LINES } from './LiveLabProtocol'
import { liveEvent } from './testLiveFakes'

describe('LiveLabProtocol', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined))
  afterEach(() => vi.restoreAllMocks())

  it('maps a snapshot field by field and drops invalid events', () => {
    const result = LiveLabProtocol.parseMessage(
      JSON.stringify({ type: 'snapshot', version: 2, doc: '{}', events: [liveEvent(), { version: 'x' }], extra: 'ignored' }),
    )
    expect(result).toEqual({ ok: true, value: { type: 'snapshot', version: 2, docText: '{}', events: [liveEvent()] } })
  })

  it('keeps command output and caps it at 200 lines', () => {
    const lines = Array.from({ length: 250 }, (_, index) => `line ${index}`)
    const event = LiveLabProtocol.event({ ...liveEvent(), output: { deviceId: 'pc', command: 'ping 10.0.0.1', lines } })
    expect(event?.output?.lines).toHaveLength(MAX_OUTPUT_LINES)
    expect(event?.output?.command).toBe('ping 10.0.0.1')
  })

  it('rejects unknown types, missing fields and non-JSON', () => {
    expect(LiveLabProtocol.parseMessage('{"type":"hello"}').ok).toBe(false)
    expect(LiveLabProtocol.parseMessage('{"type":"update","version":0,"doc":"{}"}').ok).toBe(false)
    expect(LiveLabProtocol.parseMessage('{"type":"event","event":{}}').ok).toBe(false)
    expect(LiveLabProtocol.parseMessage('nope').ok).toBe(false)
    expect(LiveLabProtocol.parseMessage('{"type":"pong"}')).toEqual({ ok: true, value: { type: 'pong' } })
  })

  it('reads the catch-up body', () => {
    expect(LiveLabProtocol.parseCatchUp({ labId: 'x', version: 5, doc: '{}', events: [] })).toEqual({ ok: true, value: { version: 5, docText: '{}', events: [] } })
    expect(LiveLabProtocol.parseCatchUp({ version: 5 }).ok).toBe(false)
  })
})
