// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createCache } from '../../server/utils/cache'
import type { Lane } from '../../server/utils/rate-limiter'

const lanes: Array<Lane | undefined> = []
// Read the clock on each call, so fake timers apply to a cache created before they're installed.
const cache = createCache({ now: () => Date.now() })

vi.mock('../../server/utils/memtime', () => ({
  CATALOG_TTL_MS: 1_000,
  CATALOG_STALE_MS: 10_000,
  useServerCache: () => cache,
  useMemtime: () => ({
    list: async ({ lane }: { lane?: Lane }) => {
      lanes.push(lane)
      return { items: [], hasMore: false, nextOffset: null }
    },
  }),
}))

const { catalogPage } = await import('../../server/utils/catalog')

describe('catalog page lanes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    lanes.length = 0
    cache.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('loads a cold page in the interactive lane: someone is waiting on that expand', async () => {
    await catalogPage('/clients', z.unknown(), 0)
    expect(lanes).toEqual(['interactive'])
  })

  it('refreshes a stale page in the background lane, so it never competes with user actions', async () => {
    await catalogPage('/clients', z.unknown(), 0)
    vi.advanceTimersByTime(1_500) // past the TTL, inside the stale window
    await catalogPage('/clients', z.unknown(), 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(lanes).toEqual(['interactive', 'background'])
  })
})
