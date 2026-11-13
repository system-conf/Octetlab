import { describe, expect, it } from 'vitest'
import type { ShareRecord } from '../../../src/features/share/model/shareContract'
import { OriginPolicy } from '../live/OriginPolicy'
import type { DeleteOutcome } from '../share/ShareRepository'
import type { CreateOutcome, ShareMeta } from '../share/ShareService'
import type { ShareStoreStub } from './AppWorkerEnv'
import { ShareHttpApi } from './ShareHttpApi'
import { ShareMetaTags } from './ShareMetaTags'

const ORIGIN = 'https://octetlab.example'
const ID = 'Ab3dEf7hIj'

describe('ShareMetaTags', () => {
  const meta: ShareMeta = { id: ID, title: 'Lab "A" & <b>B</b>', author: 'Ada', description: '', hasImage: true }

  it('escapes user text in every tag and points og:image at the rendered topology', () => {
    const html = ShareMetaTags.html(meta, ORIGIN)
    expect(html).not.toContain('<b>')
    expect(html).toContain('<meta property="og:title" content="Lab &quot;A&quot; &amp; bB/b" />')
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/p/${ID}/og.png" />`)
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/p/${ID}" />`)
    expect(html).toContain('A network lab by Ada, built in Octetlab')
  })

  it('uses the app image without a rendered one and the first paragraph of the description', () => {
    const html = ShareMetaTags.html({ ...meta, hasImage: false, description: 'VLAN 10 and 20.\n\nMore text.' }, ORIGIN)
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/ogImage.png" />`)
    expect(html).toContain('<meta name="description" content="VLAN 10 and 20." />')
  })
})

class FakeStore implements ShareStoreStub {
  bodies: string[] = []
  createOutcome: CreateOutcome = { ok: true, id: ID, created: true, deleteToken: 'token-token-token-1' }
  create(bodyText: string): Promise<CreateOutcome> {
    this.bodies.push(bodyText)
    return Promise.resolve(this.createOutcome)
  }
  read(id: string): Promise<ShareRecord | null> {
    return Promise.resolve(id === ID ? { id, title: 't', author: '', linkedinUrl: '', description: '', createdAt: '2026-11-13T00:00:00.000Z', doc: '{}', hasImage: false } : null)
  }
  meta(): Promise<ShareMeta | null> {
    return Promise.resolve(null)
  }
  image(): Promise<Uint8Array | null> {
    return Promise.resolve(null)
  }
  remove(_id: string, token: string): Promise<DeleteOutcome> {
    return Promise.resolve(token === 'token-token-token-1' ? 'deleted' : 'forbidden')
  }
}

function api(store: ShareStoreStub, allowed = true) {
  return new ShareHttpApi({ store: () => store, origins: new OriginPolicy('http://localhost:5300'), limiter: { allows: () => Promise.resolve(allowed) } })
}

const post = (headers: Record<string, string>) => new Request(`${ORIGIN}/api/shares`, { method: 'POST', headers, body: '{}' })

describe('ShareHttpApi', () => {
  it('creates from the app origin (or an allowed dev origin) and refuses others', async () => {
    const store = new FakeStore()
    expect((await api(store).handle(post({ Origin: ORIGIN }))).status).toBe(201)
    expect((await api(store).handle(post({ Origin: 'http://localhost:5300' }))).status).toBe(201)
    expect((await api(store).handle(post({ Origin: 'https://evil.example' }))).status).toBe(403)
    expect((await api(store).handle(post({}))).status).toBe(403)
    expect(store.bodies).toHaveLength(2)
  })

  it('answers 200 for existing content, 429 over the rate limit and maps store errors', async () => {
    const store = new FakeStore()
    store.createOutcome = { ok: true, id: ID, created: false, deleteToken: null }
    expect((await api(store).handle(post({ Origin: ORIGIN }))).status).toBe(200)
    expect((await api(store, false).handle(post({ Origin: ORIGIN }))).status).toBe(429)
    store.createOutcome = { ok: false, error: 'invalidLab', message: 'bad' }
    const refused = await api(store).handle(post({ Origin: ORIGIN }))
    expect(refused.status).toBe(422)
    expect(await refused.json()).toEqual({ error: 'invalidLab', message: 'bad' })
  })

  it('reads records, deletes with the token and redirects a missing image to the default one', async () => {
    const store = new FakeStore()
    expect((await api(store).handle(new Request(`${ORIGIN}/api/shares/${ID}`))).status).toBe(200)
    expect((await api(store).handle(new Request(`${ORIGIN}/api/shares/short`))).status).toBe(404)
    const del = (token?: string) =>
      new Request(`${ORIGIN}/api/shares/${ID}`, { method: 'DELETE', headers: { Origin: ORIGIN, ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) } })
    expect((await api(store).handle(del())).status).toBe(403)
    expect((await api(store).handle(del('wrong-token-123456'))).status).toBe(403)
    expect((await api(store).handle(del('token-token-token-1'))).status).toBe(204)
    const image = await api(store).handle(new Request(`${ORIGIN}/p/${ID}/og.png`))
    expect(image.status).toBe(302)
    expect(image.headers.get('Location')).toBe(`${ORIGIN}/ogImage.png`)
  })

  it('reports a failing store as unavailable', async () => {
    const store = new FakeStore()
    store.read = () => Promise.reject(new Error('object reset'))
    const answer = await api(store).handle(new Request(`${ORIGIN}/api/shares/${ID}`))
    expect(answer.status).toBe(503)
  })
})
