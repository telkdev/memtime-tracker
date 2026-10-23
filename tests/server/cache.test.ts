// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '../../server/utils/cache'

describe('cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it('coalesces concurrent identical calls into one fetch', async () => {
    const cache = createCache()
    const fn = vi.fn(async () => 'value')
    const [a, b] = await Promise.all([
      cache.cached('k', fn, { ttlMs: 1000 }),
      cache.cached('k', fn, { ttlMs: 1000 }),
    ])
    expect([a, b]).toEqual(['value', 'value'])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('serves fresh values without refetching and refetches after the TTL', async () => {
    const cache = createCache()
    const fn = vi.fn(async () => 'v')
    await cache.cached('k', fn, { ttlMs: 1000 })
    vi.advanceTimersByTime(999)
    await cache.cached('k', fn, { ttlMs: 1000 })
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await cache.cached('k', fn, { ttlMs: 1000 })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('serves stale values while revalidating in the background', async () => {
    const cache = createCache()
    let n = 0
    const fn = vi.fn(async () => ++n)
    await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })
    vi.advanceTimersByTime(2000)

    expect(await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })).toBe(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })).toBe(2)
  })

  it('tells the loader whether it is a cold load or the quiet refresh behind a stale value', async () => {
    const cache = createCache()
    const seen: boolean[] = []
    const fn = vi.fn(async ({ revalidating }: { revalidating: boolean }) => {
      seen.push(revalidating)
      return 'v'
    })
    await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })
    vi.advanceTimersByTime(1500)
    await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })
    await vi.advanceTimersByTimeAsync(0)
    vi.advanceTimersByTime(10_000)
    await cache.cached('k', fn, { ttlMs: 1000, staleMs: 5000 })
    expect(seen).toEqual([false, true, false])
  })

  it('never makes a waiting caller join a quiet revalidation that is still queued', async () => {
    const cache = createCache()
    let release: (v: string) => void = () => {}
    const slowRefresh = vi.fn(() => new Promise<string>(r => (release = r)))
    await cache.cached('k', async () => 'old', { ttlMs: 1000, staleMs: 1000 })
    vi.advanceTimersByTime(1500)
    // Stale: served at once, refresh queued (think: background lane, no deadline).
    expect(await cache.cached('k', slowRefresh, { ttlMs: 1000, staleMs: 1000 })).toBe('old')
    vi.advanceTimersByTime(1000) // now past staleUntil, so the next caller must wait for data

    const cold = vi.fn(async () => 'new')
    await expect(cache.cached('k', cold, { ttlMs: 1000 })).resolves.toBe('new')
    expect(cold).toHaveBeenCalledWith({ revalidating: false })
    release('late')
    await vi.advanceTimersByTimeAsync(0)
    expect(await cache.cached('k', async () => 'unused', { ttlMs: 1000 })).toBe('new')
  })

  it('after invalidation, a new call neither reuses nor is overwritten by the old in-flight load', async () => {
    const cache = createCache()
    let release: (v: string) => void = () => {}
    const pending = cache.cached('p:k', () => new Promise<string>(r => (release = r)), { ttlMs: 1000 })
    cache.invalidatePrefix('p:')
    await expect(cache.cached('p:k', async () => 'fresh', { ttlMs: 1000 })).resolves.toBe('fresh')
    release('stale')
    await pending
    expect(await cache.cached('p:k', async () => 'unused', { ttlMs: 1000 })).toBe('fresh')
  })

  it('does not cache errors', async () => {
    const cache = createCache()
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    await expect(cache.cached('k', fn, { ttlMs: 1000 })).rejects.toThrow('boom')
    await expect(cache.cached('k', fn, { ttlMs: 1000 })).resolves.toBe('ok')
  })

  it('invalidates by prefix and bypasses with force', async () => {
    const cache = createCache()
    const fn = vi.fn(async () => 'v')
    await cache.cached('catalog:a', fn, { ttlMs: 1000 })
    await cache.cached('catalog:b', fn, { ttlMs: 1000 })
    await cache.cached('other', fn, { ttlMs: 1000 })
    cache.invalidatePrefix('catalog:')

    await cache.cached('catalog:a', fn, { ttlMs: 1000 })
    await cache.cached('other', fn, { ttlMs: 1000 })
    expect(fn).toHaveBeenCalledTimes(4)

    await cache.cached('other', fn, { ttlMs: 1000, force: true })
    expect(fn).toHaveBeenCalledTimes(5)
  })
})
