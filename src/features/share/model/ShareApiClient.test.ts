import { describe, expect, it } from 'vitest'
import { ShareApiClient, ShareApiError, type FetchPort } from './ShareApiClient'
import { ShareTokenStore, type TokenStorage } from './ShareTokenStore'

function clientAnswering(answer: () => Response | Promise<Response>, calls: { url: string; init?: RequestInit }[] = []): ShareApiClient {
  const fetcher: FetchPort = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(answer())
  }
  return new ShareApiClient(fetcher, 'https://app.example')
}

async function failureOf(promise: Promise<unknown>): Promise<ShareApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ShareApiError) return error
    throw error
  }
  throw new Error('expected a ShareApiError')
}

const draft = { doc: '{}', title: 'Lab', author: '', linkedinUrl: '', description: '' }

describe('ShareApiClient', () => {
  it('posts a draft to the same origin and returns the validated answer', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const client = clientAnswering(() => Response.json({ id: 'Ab3dEf7hIj', created: true, deleteToken: 'token-token-token-1' }, { status: 201 }), calls)
    await expect(client.create(draft)).resolves.toEqual({ id: 'Ab3dEf7hIj', created: true, deleteToken: 'token-token-token-1' })
    expect(calls[0]?.url).toBe('https://app.example/api/shares')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(client.pageUrl('Ab3dEf7hIj')).toBe('https://app.example/p/Ab3dEf7hIj')
  })

  it('keeps the server error code', async () => {
    const client = clientAnswering(() => Response.json({ error: 'tooManyRequests', message: 'slow down' }, { status: 429 }))
    expect((await failureOf(client.create(draft))).code).toBe('tooManyRequests')
  })

  it('derives a code from the status when the body has none', async () => {
    const client = clientAnswering(() => new Response('gone', { status: 404 }))
    expect((await failureOf(client.get('Ab3dEf7hIj'))).code).toBe('notFound')
  })

  it('reports an answer that breaks the contract as unexpected, and a network error as unavailable', async () => {
    expect((await failureOf(clientAnswering(() => Response.json({ id: 'x' })).get('Ab3dEf7hIj'))).code).toBe('unexpected')
    const offline = new ShareApiClient(() => Promise.reject(new TypeError('Failed to fetch')), 'https://app.example')
    expect((await failureOf(offline.get('Ab3dEf7hIj'))).code).toBe('unavailable')
  })

  it('deletes with the bearer token and expects 204', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    await clientAnswering(() => new Response(null, { status: 204 }), calls).remove('Ab3dEf7hIj', 'secret-token-123456')
    expect(calls[0]?.init?.headers).toEqual({ Authorization: 'Bearer secret-token-123456' })
    const forbidden = clientAnswering(() => Response.json({ error: 'forbidden', message: 'no' }, { status: 403 }))
    expect((await failureOf(forbidden.remove('Ab3dEf7hIj', 'wrong-token-123456'))).code).toBe('forbidden')
  })
})

class MemoryStorage implements TokenStorage {
  values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('ShareTokenStore', () => {
  it('remembers and forgets delete tokens per share', () => {
    const store = new ShareTokenStore(new MemoryStorage())
    expect(store.remember('Ab3dEf7hIj', 'token-token-token-1')).toBe(true)
    expect(store.tokenOf('Ab3dEf7hIj')).toBe('token-token-token-1')
    store.forget('Ab3dEf7hIj')
    expect(store.tokenOf('Ab3dEf7hIj')).toBeNull()
  })

  it('ignores unreadable stored data and works without storage', () => {
    const storage = new MemoryStorage()
    storage.setItem('octetlab.shareTokens', '{"bad id": 3}')
    expect(new ShareTokenStore(storage).tokenOf('Ab3dEf7hIj')).toBeNull()
    expect(new ShareTokenStore(null).remember('Ab3dEf7hIj', 'token-token-token-1')).toBe(false)
  })
})
