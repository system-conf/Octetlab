import { describe, expect, it } from 'vitest'
import { AppRouteCodec, type AppRoute } from './AppRoute'
import { AppRouter, type HistoryPort, type UrlParts } from './AppRouter'

/** In-memory history with back(): enough to drive the router like a browser. */
class FakeHistory implements HistoryPort {
  entries: UrlParts[]
  index = 0
  private listeners: (() => void)[] = []

  constructor(url: string) {
    this.entries = [FakeHistory.parse(url)]
  }

  static parse(url: string): UrlParts {
    const parsed = new URL(url, 'https://lab.example')
    return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash }
  }

  get url(): string {
    const current = this.location()
    return `${current.pathname}${current.search}${current.hash}`
  }

  location(): UrlParts {
    const entry = this.entries[this.index]
    if (entry === undefined) throw new Error('empty history')
    return entry
  }

  push(url: string): void {
    this.entries = [...this.entries.slice(0, this.index + 1), FakeHistory.parse(url)]
    this.index += 1
  }

  replace(url: string): void {
    this.entries[this.index] = FakeHistory.parse(url)
  }

  onPopState(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((existing) => existing !== listener)
    }
  }

  back(): void {
    this.index = Math.max(0, this.index - 1)
    for (const listener of this.listeners) listener()
  }
}

describe('AppRouteCodec', () => {
  const cases: [string, AppRoute][] = [
    ['/', { name: 'landing' }],
    ['/lab', { name: 'lab' }],
    ['/lab/', { name: 'lab' }],
    ['/exercises', { name: 'exercises' }],
    ['/exercises/posGateway', { name: 'exercise', exerciseId: 'posGateway' }],
    ['/exercises/posGateway/report', { name: 'exerciseReport', exerciseId: 'posGateway' }],
    ['/design', { name: 'designs' }],
    ['/design/', { name: 'designs' }],
    ['/design/smallOffice', { name: 'design', briefId: 'smallOffice' }],
    ['/design/smallOffice/review', { name: 'designReview', briefId: 'smallOffice' }],
    // SL1 (sample labs)
    ['/samples', { name: 'samples' }],
    ['/samples/', { name: 'samples' }],
    ['/samples/twoPcsSwitch', { name: 'sample', sampleId: 'twoPcsSwitch' }],
    // PU (Preferences screen)
    ['/preferences', { name: 'preferences' }],
    ['/preferences/', { name: 'preferences' }],
    // Live labs
    ['/live/AbCdEfGhIjKlMnOp_r-tUv', { name: 'live', labId: 'AbCdEfGhIjKlMnOp_r-tUv' }],
    // Start dialog: the former start page
    ['/about', { name: 'about' }],
    ['/about/', { name: 'about' }],
    // Share pages
    ['/p/Ab3dEf7hIj', { name: 'share', shareId: 'Ab3dEf7hIj' }],
  ]

  it.each(cases)('parses %s', (path, route) => {
    expect(AppRouteCodec.parse(path)).toEqual(route)
  })

  it.each(cases.filter(([path]) => !path.endsWith('/') || path === '/'))('formats back to %s', (path, route) => {
    expect(AppRouteCodec.format(route)).toBe(path)
  })

  const notFound = [
    '/lab/extra',
    '/settings',
    '/exercises/pos-gateway',
    '/exercises/x/report/more',
    '/exercises/x/other',
    '/exercises/%E0%A4%A',
    '/design/small-office',
    '/design/x/report',
    '/design/x/review/more',
    // SL1 (sample labs)
    '/samples/two-pcs',
    '/samples/twoPcs/more',
    '/samples/1abc',
    '/samples/%E0%A4%A',
    // PU (Preferences screen)
    '/preferences/map',
    // Live labs
    '/live',
    '/live/short',
    '/live/AbCdEfGhIjKlMnOpQrStUv/more',
    '/live/AbCdEfGhIjKlMnOpQrSt.v',
    '/about/team',
    // Share pages
    '/p',
    '/p/short',
    '/p/Ab3dEf7hIj/og.png',
    '/p/Ab3dEf7h-j',
  ]

  it.each(notFound)('treats %s as not found', (path) => {
    expect(AppRouteCodec.parse(path)).toEqual({ name: 'notFound', path })
  })

  it('compares routes by path', () => {
    expect(AppRouteCodec.equals({ name: 'exercise', exerciseId: 'a' }, { name: 'exercise', exerciseId: 'a' })).toBe(true)
    expect(AppRouteCodec.equals({ name: 'exercise', exerciseId: 'a' }, { name: 'exerciseReport', exerciseId: 'a' })).toBe(false)
  })
})

describe('AppRouter', () => {
  it('reads the route from the location and keeps it stable until the path changes', () => {
    const router = new AppRouter(new FakeHistory('/exercises/wrongDns?lang=tr'))
    const first = router.route
    expect(first).toEqual({ name: 'exercise', exerciseId: 'wrongDns' })
    expect(router.route).toBe(first)
  })

  it('pushes a new entry, keeps ?lang= and notifies subscribers', () => {
    const history = new FakeHistory('/?lang=tr')
    const router = new AppRouter(history)
    let calls = 0
    router.subscribe(() => {
      calls += 1
    })
    router.navigate({ name: 'lab' })
    expect(history.url).toBe('/lab?lang=tr')
    expect(history.entries).toHaveLength(2)
    expect(router.route).toEqual({ name: 'lab' })
    expect(calls).toBe(1)
  })

  it('replaces the entry on redirects and drops the hash unless asked', () => {
    const history = new FakeHistory('/#lab=abc')
    const router = new AppRouter(history)
    router.navigate({ name: 'lab' }, { replace: true, keepHash: true })
    expect(history.url).toBe('/lab#lab=abc')
    expect(history.entries).toHaveLength(1)
    router.navigate({ name: 'exercises' }, { replace: true })
    expect(history.url).toBe('/exercises')
  })

  it('does nothing when navigating to the current URL', () => {
    const history = new FakeHistory('/lab')
    const router = new AppRouter(history)
    let calls = 0
    router.subscribe(() => {
      calls += 1
    })
    router.navigate({ name: 'lab' })
    expect(history.entries).toHaveLength(1)
    expect(calls).toBe(0)
  })

  it('follows back / forward through popstate', () => {
    const history = new FakeHistory('/')
    const router = new AppRouter(history)
    router.navigate({ name: 'exercises' })
    let calls = 0
    const unsubscribe = router.subscribe(() => {
      calls += 1
    })
    history.back()
    expect(router.route).toEqual({ name: 'landing' })
    expect(calls).toBe(1)
    unsubscribe()
    router.navigate({ name: 'lab' })
    expect(calls).toBe(1)
  })

  it('builds hrefs with the query string', () => {
    const router = new AppRouter(new FakeHistory('/?lang=en'))
    expect(router.href({ name: 'exerciseReport', exerciseId: 'kitchenVlan' })).toBe('/exercises/kitchenVlan/report?lang=en')
  })

  it('updates a query parameter only when it is present', () => {
    const history = new FakeHistory('/lab?lang=tr#lab=x')
    const router = new AppRouter(history)
    router.updateQueryParameter('lang', 'en')
    expect(history.url).toBe('/lab?lang=en#lab=x')
    const plain = new FakeHistory('/lab')
    new AppRouter(plain).updateQueryParameter('lang', 'en')
    expect(plain.url).toBe('/lab')
  })
})
