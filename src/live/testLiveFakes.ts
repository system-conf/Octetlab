// Test-only fakes for live labs: a manual clock, scripted sockets and a scripted fetch.
import type { LabDocument } from '../domain'
import { labSerializer } from '../lab'
import { sampleLab } from '../lab/testLabs'
import { LiveLabEndpoints } from './LiveLabEndpoints'
import type { LiveClock, LiveHttpResponse, LiveLabConnectionDeps, LiveSocketHandlers } from './LiveLabConnection'
import type { LiveEvent } from './LiveLabProtocol'

/** Runs scheduled tasks only when the test advances time. */
export class FakeClock implements LiveClock {
  now = 0
  private tasks: { at: number; task: () => void; id: number }[] = []
  private nextId = 1

  schedule = (task: () => void, delayMs: number): (() => void) => {
    const id = this.nextId++
    this.tasks.push({ at: this.now + delayMs, task, id })
    return () => {
      this.tasks = this.tasks.filter((entry) => entry.id !== id)
    }
  }

  get pending(): number[] {
    return this.tasks.map((entry) => entry.at - this.now)
  }

  advance(ms: number): void {
    const until = this.now + ms
    for (;;) {
      const due = this.tasks.filter((entry) => entry.at <= until).sort((first, second) => first.at - second.at)[0]
      if (due === undefined) break
      this.tasks = this.tasks.filter((entry) => entry.id !== due.id)
      this.now = due.at
      due.task()
    }
    this.now = until
  }
}

export class FakeSocket {
  readonly sent: string[] = []
  closed = false
  readonly url: string
  readonly handlers: LiveSocketHandlers

  constructor(url: string, handlers: LiveSocketHandlers) {
    this.url = url
    this.handlers = handlers
  }

  send = (text: string): void => {
    this.sent.push(text)
  }

  close = (): void => {
    this.closed = true
  }

  receive(message: object): void {
    this.handlers.message(JSON.stringify(message))
  }
}

export interface FakeTransport {
  deps: LiveLabConnectionDeps
  clock: FakeClock
  sockets: FakeSocket[]
  requests: string[]
  /** Answers of the next fetches, in order; a string rejects with that message. */
  responses: (LiveHttpResponse | string)[]
  last: () => FakeSocket
}

export function fakeTransport(): FakeTransport {
  const clock = new FakeClock()
  const sockets: FakeSocket[] = []
  const requests: string[] = []
  const responses: (LiveHttpResponse | string)[] = []
  const deps: LiveLabConnectionDeps = {
    endpoints: new LiveLabEndpoints('https://live.example'),
    clock,
    openSocket: (url, handlers) => {
      const socket = new FakeSocket(url, handlers)
      sockets.push(socket)
      return socket
    },
    fetch: (url) => {
      requests.push(url)
      const next = responses.shift()
      if (next === undefined) return Promise.reject(new Error('no scripted response'))
      return typeof next === 'string' ? Promise.reject(new Error(next)) : Promise.resolve(next)
    },
  }
  return {
    deps,
    clock,
    sockets,
    requests,
    responses,
    last: () => {
      const socket = sockets[sockets.length - 1]
      if (socket === undefined) throw new Error('no socket opened')
      return socket
    },
  }
}

export function httpResponse(status: number, body: unknown = null): LiveHttpResponse {
  return { status, json: () => Promise.resolve(body) }
}

/** The sample lab, optionally without some devices (and their links). */
export function liveLab(withoutDevices: readonly string[] = []): LabDocument {
  const lab = sampleLab()
  const devices = lab.state.devices.filter((device) => !withoutDevices.includes(device.id))
  const ids = new Set(devices.map((device) => device.id))
  const links = lab.state.links.filter((link) => ids.has(link.a.deviceId) && ids.has(link.b.deviceId))
  const layout = { ...lab.layout, devices: Object.fromEntries(Object.entries(lab.layout.devices).filter(([id]) => ids.has(id))) }
  return { ...lab, state: { ...lab.state, devices, links }, layout }
}

export function docText(doc: LabDocument = liveLab()): string {
  return labSerializer.serializeCompact(doc)
}

export function liveEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    version: 2,
    at: '2026-11-12T10:00:00.000Z',
    actor: 'assistant',
    tool: 'add_device',
    summary: 'Added Office Router (router3Port).',
    deviceIds: ['router'],
    linkIds: [],
    ...overrides,
  }
}

/** Lets pending promise callbacks (fetch → json → handling) run. */
export async function flushPromises(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Promise.resolve()
}
