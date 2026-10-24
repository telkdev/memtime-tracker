import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'

const client = (id: number) => ({ id, name: `Client ${id}`, description: '', status: 'active', createdAt: '', updatedAt: '' })

const calls: string[] = []
let answer: (offset: string) => { status: number, body: unknown }
registerEndpoint('/api/clients', (event) => {
  const offset = new URL(event.node.req.url ?? '', 'http://x').searchParams.get('offset') ?? '0'
  calls.push(offset)
  const { status, body } = answer(offset)
  setResponseStatus(event, status)
  return body
})

const project = (id: number) => ({ id, clientId: 1, name: `Project ${id}`, description: '', status: 'active', createdAt: '', updatedAt: '' })

// Held open until the test resolves it, to finish a load after a refresh.
let releaseProjects: (() => void) | undefined
registerEndpoint('/api/clients/1/projects', () => new Promise((resolve) => {
  releaseProjects = () => resolve({ items: [project(10)], hasMore: false, nextOffset: null })
}))

let refreshFails = false
registerEndpoint('/api/catalog/refresh', {
  method: 'POST',
  handler: (event) => {
    if (!refreshFails) return { ok: true }
    setResponseStatus(event, 503)
    return { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Try again.' } }
  },
})

describe('useCatalog retry', () => {
  beforeEach(() => {
    calls.length = 0
    useState('catalog:nodes').value = {}
    useState('catalog:expanded').value = []
    refreshFails = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries a failed "Load more" from where it stopped, keeping the loaded page', async () => {
    let failMore = true
    answer = (offset) => {
      if (offset === '0') return { status: 200, body: { items: [client(1)], hasMore: true, nextOffset: 100 } }
      if (failMore) return { status: 503, body: { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Try again.' } } }
      return { status: 200, body: { items: [client(2)], hasMore: false, nextOffset: null } }
    }
    const catalog = useCatalog()
    await catalog.load('root')
    await catalog.loadMore('root')
    expect(catalog.node('root').status).toBe('error')
    failMore = false
    await catalog.retry('root')
    expect(calls.at(-1)).toBe('100')
    expect(catalog.node('root').items).toHaveLength(2)
  })

  it('does not jump the queue when the user activates a row that is waiting out a rate limit', async () => {
    answer = () => ({ status: 429, body: { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests.', retryAfter: 30 } } })
    const catalog = useCatalog()
    await catalog.load('root')
    expect(catalog.node('root').status).toBe('waiting')
    await catalog.retry('root')
    expect(calls).toEqual(['0'])
  })

  it('drops a load that was in flight when the catalog was refreshed', async () => {
    answer = () => ({ status: 200, body: { items: [client(1)], hasMore: false, nextOffset: null } })
    const catalog = useCatalog()
    await catalog.load('root')
    const stale = catalog.load('client:1')
    await vi.waitFor(() => expect(releaseProjects).toBeDefined())

    await catalog.refresh()
    releaseProjects!()
    await stale

    expect(catalog.node('client:1').items).toEqual([])
    expect(catalog.node('client:1').status).toBe('idle')
  })

  it('keeps the rate-limit retry of a waiting node when the refresh request fails', async () => {
    // shouldAdvanceTime keeps $fetch working; advanceTimersByTime then skips the retry delay.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    answer = () => ({ status: 429, body: { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests.', retryAfter: 30 } } })
    const catalog = useCatalog()
    await catalog.load('root')
    expect(catalog.node('root').status).toBe('waiting')

    refreshFails = true
    await expect(catalog.refresh()).rejects.toThrow()
    answer = () => ({ status: 200, body: { items: [client(1)], hasMore: false, nextOffset: null } })
    await vi.advanceTimersByTimeAsync(30_000)

    await vi.waitFor(() => expect(catalog.node('root').status).toBe('loaded'))
    expect(calls).toEqual(['0', '0'])
  })
})
