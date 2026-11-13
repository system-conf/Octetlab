import { describe, expect, it } from 'vitest'
import { labSerializer } from '../../../src/lab/LabSerializer'
import { shareTestLab } from '../../../src/features/share/model/testShareLab'
import { OgImageSvg } from './OgImageSvg'
import { ShareService, type PngRenderer } from './ShareService'
import { SqlShareRepository } from './SqlShareRepository'
import { memorySqlPort } from './testSqlPort'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

class FakeRenderer implements PngRenderer {
  svgs: string[] = []
  fail = false
  render(svg: string): Promise<Uint8Array> {
    this.svgs.push(svg)
    return this.fail ? Promise.reject(new Error('wasm broke')) : Promise.resolve(PNG)
  }
}

function setup() {
  const renderer = new FakeRenderer()
  const service = new ShareService(new SqlShareRepository(memorySqlPort()), renderer, () => new Date('2026-11-13T12:00:00.000Z'))
  return { service, renderer }
}

// One document for all requests (the test network's MAC addresses differ per build).
const DOC = labSerializer.serializeCompact(shareTestLab())

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    doc: DOC,
    title: 'Cafe VLANs',
    author: 'Ada',
    linkedinUrl: 'https://tr.linkedin.com/in/ada',
    description: 'Router on a stick.',
    ...overrides,
  })
}

describe('ShareService', () => {
  it('stores a new share with a delete token and renders its image once', async () => {
    const { service, renderer } = setup()
    const created = await service.create(body())
    if (!created.ok) throw new Error(created.message)
    expect(created.created).toBe(true)
    expect(created.id).toMatch(/^[A-Za-z0-9]{10}$/)
    expect(created.deleteToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(renderer.svgs).toHaveLength(1)
    expect(service.image(created.id)).toEqual(PNG)
    expect(service.read(created.id)).toMatchObject({
      id: created.id,
      title: 'Cafe VLANs',
      linkedinUrl: 'https://www.linkedin.com/in/ada',
      createdAt: '2026-11-13T12:00:00.000Z',
      hasImage: true,
    })
  })

  it('returns the same id for the same content (UNIQUE content hash) without a new token or render', async () => {
    const { service, renderer } = setup()
    const first = await service.create(body())
    const second = await service.create(body())
    if (!first.ok || !second.ok) throw new Error('create failed')
    expect(second).toEqual({ ok: true, id: first.id, created: false, deleteToken: null })
    expect(renderer.svgs).toHaveLength(1)
    const other = await service.create(body({ author: 'Grace' }))
    expect(other.ok && other.id !== first.id && other.created).toBe(true)
  })

  it('refuses bad requests with their error code', async () => {
    const { service } = setup()
    expect(await service.create('not json')).toMatchObject({ ok: false, error: 'invalidRequest' })
    expect(await service.create(body({ linkedinUrl: 'https://evil.example/in/ada' }))).toMatchObject({ ok: false, error: 'invalidRequest' })
    expect(await service.create(body({ title: '' }))).toMatchObject({ ok: false, error: 'invalidRequest' })
    expect(await service.create(body({ doc: '{"schemaVersion":2}' }))).toMatchObject({ ok: false, error: 'invalidLab' })
    expect(await service.create(body({ doc: 'x'.repeat(256_001) }))).toMatchObject({ ok: false, error: 'tooLarge' })
  })

  it('keeps the share when the image cannot be rendered', async () => {
    const { service, renderer } = setup()
    renderer.fail = true
    const created = await service.create(body())
    if (!created.ok) throw new Error(created.message)
    expect(service.read(created.id)?.hasImage).toBe(false)
    expect(service.image(created.id)).toBeNull()
  })

  it('deletes only with the creator token', async () => {
    const { service } = setup()
    const created = await service.create(body())
    if (!created.ok || created.deleteToken === null) throw new Error('create failed')
    expect(await service.remove(created.id, 'not-the-token-at-all')).toBe('forbidden')
    expect(await service.remove(created.id, created.deleteToken)).toBe('deleted')
    expect(await service.remove(created.id, created.deleteToken)).toBe('notFound')
    expect(service.read(created.id)).toBeNull()
    expect(service.meta('bad id')).toBeNull()
  })
})

describe('OgImageSvg', () => {
  it('draws a 1200×630 picture with one circle pair per device and no user text', () => {
    const doc = shareTestLab('<script>alert(1)</script>')
    const svg = OgImageSvg.build(doc)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"')).toBe(true)
    expect(svg.match(/<circle /g)?.length).toBe(doc.state.devices.length * 2 + 3)
    expect(svg).not.toContain('script')
    expect(svg).not.toContain('<text')
  })
})
