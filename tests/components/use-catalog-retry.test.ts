import { beforeEach, describe, expect, it } from 'vitest'
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

describe('useCatalog retry', () => {
  beforeEach(() => {
    calls.length = 0
    useState('catalog:nodes').value = {}
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
})
