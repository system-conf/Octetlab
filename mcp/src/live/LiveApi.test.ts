import { describe, expect, it } from 'vitest'
import { LiveApi, type RequestLimiter } from './LiveApi'
import { MemoryLabRooms } from './MemoryLabRooms'
import { OriginPolicy } from './OriginPolicy'

const APP = 'https://octetlab.slovveis.workers.dev'
const LAB_ID = 'AbCdEfGhIjKlMnOpQrStUv'

class CountingLimiter implements RequestLimiter {
  remaining: number

  constructor(remaining = 100) {
    this.remaining = remaining
  }

  allows(): Promise<boolean> {
    this.remaining--
    return Promise.resolve(this.remaining >= 0)
  }
}

async function api(limiter = new CountingLimiter()) {
  const rooms = new MemoryLabRooms()
  await rooms.room(LAB_ID).create('{"doc":1}', { at: '2026-11-12T10:00:00.000Z', actor: 'assistant', tool: 'create_lab', summary: 'Created.', deviceIds: [], linkIds: [] })
  const live = new LiveApi({ rooms, origins: new OriginPolicy(`${APP}, http://localhost:5300,http://localhost:4173/`), limiter })
  return { rooms, live, limiter }
}

function get(path: string, headers: Record<string, string> = { Origin: APP }, method = 'GET'): Request {
  return new Request(`https://mcp.test${path}`, { method, headers })
}

describe('LiveApi', () => {
  it('serves the snapshot to an allowed origin with CORS headers', async () => {
    const { live } = await api()
    const response = await live.handle(get(`/live/${LAB_ID}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ labId: LAB_ID, version: 1, doc: '{"doc":1}', events: [expect.objectContaining({ summary: 'Created.', version: 1 })] })
    const local = await live.handle(get(`/live/${LAB_ID}`, { Origin: 'http://localhost:4173' }))
    expect(local.status).toBe(200)
  })

  it('refuses other or missing origins with 403', async () => {
    const { live } = await api()
    const cases: Record<string, string>[] = [{ Origin: 'https://evil.example' }, {}, { Origin: `${APP}.evil.example` }]
    for (const headers of cases) {
      const response = await live.handle(get(`/live/${LAB_ID}`, headers))
      expect(response.status).toBe(403)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
  })

  it('answers 404 for unknown labs, malformed ids and other paths', async () => {
    const { live } = await api()
    for (const path of ['/live/BbCdEfGhIjKlMnOpQrStUv', '/live/nope', '/live/', `/live/${LAB_ID}/other`, `/live/${LAB_ID}/socket/x`]) {
      const response = await live.handle(get(path))
      expect(response.status, path).toBe(404)
      expect(await response.json()).toMatchObject({ error: 'notFound' })
    }
  })

  it('hands socket upgrades to the room and refuses plain GETs there', async () => {
    const { live, rooms } = await api()
    expect((await live.handle(get(`/live/${LAB_ID}/socket`))).status).toBe(426)
    const upgrade = await live.handle(get(`/live/${LAB_ID}/socket`, { Origin: APP, Upgrade: 'websocket' }))
    expect(upgrade.status).toBe(200)
    const watcher = rooms.entry(LAB_ID).sockets[0]
    expect(JSON.parse(watcher?.sent[0] ?? '{}')).toMatchObject({ type: 'snapshot', version: 1, doc: '{"doc":1}' })
    const unknown = await live.handle(get('/live/BbCdEfGhIjKlMnOpQrStUv/socket', { Origin: APP, Upgrade: 'websocket' }))
    expect(unknown.status).toBe(404)
  })

  it('caps watchers per room at 20', async () => {
    const { live } = await api()
    const upgrade = () => live.handle(get(`/live/${LAB_ID}/socket`, { Origin: APP, Upgrade: 'websocket' }))
    for (let index = 0; index < 20; index++) expect((await upgrade()).status).toBe(200)
    expect((await upgrade()).status).toBe(429)
  })

  it('rate-limits per client and allows only GET', async () => {
    const { live } = await api(new CountingLimiter(1))
    expect((await live.handle(get(`/live/${LAB_ID}`))).status).toBe(200)
    const limited = await live.handle(get(`/live/${LAB_ID}`))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    expect((await live.handle(get(`/live/${LAB_ID}`, { Origin: APP }, 'POST'))).status).toBe(405)
    const preflight = await live.handle(get(`/live/${LAB_ID}`, { Origin: APP }, 'OPTIONS'))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(APP)
  })
})
