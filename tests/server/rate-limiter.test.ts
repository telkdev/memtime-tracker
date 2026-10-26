// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimiter, RateLimitedError } from '../../server/utils/rate-limiter'

const WINDOW = 60_000

function setup(overrides: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
  const calls: number[] = []
  const limiter = createRateLimiter({ budget: 14, windowMs: WINDOW, maxWaitMs: 8_000, ...overrides })
  const call = (label = 0) => async () => {
    calls.push(Date.now())
    return label
  }
  return { limiter, calls, call }
}

describe('rate limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('never runs more than the budget in any window, with 50 callers across all lanes', async () => {
    const { limiter, calls, call } = setup()
    const lanes = ['write', 'interactive', 'background'] as const
    const jobs = Array.from({ length: 50 }, (_, i) =>
      limiter.schedule(lanes[i % 3]!, call(i), { maxWaitMs: Infinity }))

    await vi.advanceTimersByTimeAsync(8 * WINDOW)
    await Promise.all(jobs)

    expect(calls).toHaveLength(50)
    // Sliding check: whichever call a window starts at, it never holds more than the budget.
    for (const t of calls) {
      const inWindow = calls.filter(c => c >= t && c < t + WINDOW)
      expect(inWindow.length).toBeLessThanOrEqual(14)
    }
  })

  it('waits for the upstream reset when the upstream window ends later than ours', async () => {
    const { limiter, calls, call } = setup()
    await vi.advanceTimersByTimeAsync(50_000)
    // Upstream: 1 left, resets in 40 s (at 90 s). Our own window would reset at 60 s.
    limiter.sync(1, 40_000)
    const jobs = Array.from({ length: 5 }, () => limiter.schedule('interactive', call(), { maxWaitMs: Infinity }))

    await vi.advanceTimersByTimeAsync(15_000) // 65 s: past our old reset, before the upstream's
    expect(calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(30_000) // 95 s
    await Promise.all(jobs)
    expect(calls).toHaveLength(5)
  })

  it('runs interactive work before queued background work', async () => {
    const { limiter, call } = setup({ budget: 4, backgroundReserve: 0 })
    const order: string[] = []
    const track = (name: string) => async () => {
      order.push(name)
    }
    // Spend the window so everything below has to queue.
    await Promise.all([1, 2, 3, 4].map(() => limiter.schedule('interactive', call())))

    const bg = Array.from({ length: 3 }, (_, i) => limiter.schedule('background', track(`bg${i}`)))
    const fg = limiter.schedule('interactive', track('fg'), { maxWaitMs: Infinity })

    await vi.advanceTimersByTimeAsync(2 * WINDOW)
    await Promise.all([...bg, fg])
    expect(order[0]).toBe('fg')
  })

  it('runs writes before interactive work', async () => {
    const { limiter, call } = setup({ budget: 2 })
    const order: string[] = []
    const track = (name: string) => async () => {
      order.push(name)
    }
    await Promise.all([1, 2].map(() => limiter.schedule('interactive', call())))

    const a = limiter.schedule('interactive', track('interactive'), { maxWaitMs: Infinity })
    const b = limiter.schedule('write', track('write'), { maxWaitMs: Infinity })

    await vi.advanceTimersByTimeAsync(WINDOW)
    await Promise.all([a, b])
    expect(order).toEqual(['write', 'interactive'])
  })

  it('keeps a reserve that background work cannot use', async () => {
    const { limiter, calls, call } = setup({ budget: 5, backgroundReserve: 3 })
    const bg = Array.from({ length: 5 }, () => limiter.schedule('background', call()))
    await vi.advanceTimersByTimeAsync(0)

    expect(calls).toHaveLength(2)
    await limiter.schedule('interactive', call())
    expect(calls).toHaveLength(3)

    await vi.advanceTimersByTimeAsync(3 * WINDOW)
    await Promise.all(bg)
  })

  it('caps background work at half the window, so user actions never wait behind name lookups', async () => {
    const { limiter, calls, call } = setup()
    const lookups = Array.from({ length: 20 }, () => limiter.schedule('background', call()))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(7)

    // A burst of expands and page changes right after still starts immediately.
    const started = Date.now()
    await Promise.all(Array.from({ length: 7 }, () => limiter.schedule('interactive', call())))
    expect(calls).toHaveLength(14)
    expect(Date.now()).toBe(started)

    // The rest of the lookups continue in later windows, still at most 7 per window.
    await vi.advanceTimersByTimeAsync(2 * WINDOW)
    await Promise.all(lookups)
    const firstWindowEnd = started + WINDOW
    expect(calls.filter(t => t >= firstWindowEnd && t < firstWindowEnd + WINDOW)).toHaveLength(7)
  })

  it('lets background use less than its share when the upstream says the budget is low', async () => {
    const { limiter, calls, call } = setup()
    limiter.sync(6) // 5 left for us; reserve 3 → 2 for background
    const lookups = Array.from({ length: 5 }, () => limiter.schedule('background', call()))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2 * WINDOW)
    await Promise.all(lookups)
  })

  it('rejects instead of queueing when the wait would exceed maxWaitMs', async () => {
    const { limiter, call } = setup({ budget: 2 })
    await Promise.all([1, 2].map(() => limiter.schedule('interactive', call())))
    vi.advanceTimersByTime(10_000)

    const err = await limiter.schedule('interactive', call()).catch(e => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect((err as RateLimitedError).retryAfterMs).toBe(50_000)
  })

  it('starts a fresh budget when the window resets', async () => {
    const { limiter, calls, call } = setup({ budget: 2 })
    await Promise.all([1, 2].map(() => limiter.schedule('interactive', call())))
    vi.advanceTimersByTime(WINDOW)

    await limiter.schedule('interactive', call())
    expect(calls).toHaveLength(3)
    expect(limiter.snapshot().remaining).toBe(1)
  })

  it('pauses every lane after penalize() and escalates on repeated 429s', async () => {
    const { limiter, calls, call } = setup()
    limiter.penalize()
    expect(limiter.snapshot()).toMatchObject({ remaining: 0, blockedForMs: 2_000 })

    const job = limiter.schedule('interactive', call())
    await vi.advanceTimersByTimeAsync(1_999)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await job
    expect(calls).toHaveLength(1)

    limiter.penalize()
    expect(limiter.snapshot().blockedForMs).toBe(5_000)
    limiter.recordSuccess()
    vi.advanceTimersByTime(5_000)
    limiter.penalize()
    expect(limiter.snapshot().blockedForMs).toBe(2_000)
  })

  it('honours an explicit retry-after when given', () => {
    const { limiter } = setup()
    limiter.penalize(7_000)
    expect(limiter.snapshot().blockedForMs).toBe(7_000)
  })

  it('lowers its own budget to what the upstream reports, keeping one spare', () => {
    const { limiter } = setup()
    limiter.sync(5)
    expect(limiter.snapshot().remaining).toBe(4)
    // A more optimistic upstream number never raises our count back up.
    limiter.sync(15)
    expect(limiter.snapshot().remaining).toBe(4)
  })

  it('pauses every lane until the upstream reset when it reports 0 remaining', async () => {
    const { limiter, calls, call } = setup()
    limiter.sync(0, 20_000)
    expect(limiter.snapshot()).toMatchObject({ remaining: 0, blockedForMs: 20_000 })
    const job = limiter.schedule('background', call())
    await vi.advanceTimersByTimeAsync(19_999)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await job
    expect(calls).toHaveLength(1)
  })

  it('rejects a queued call at its own deadline, not when a later pause ends', async () => {
    const { limiter, call } = setup({ budget: 1 })
    await limiter.schedule('interactive', call())
    await vi.advanceTimersByTimeAsync(55_000)
    // 5 s to the next window: within the 8 s cap, so it queues.
    let settled: unknown = null
    limiter.schedule('interactive', call()).then(() => (settled = 'ran'), (e: unknown) => (settled = e))
    // Then an upstream 429 pauses everything for 45 s.
    limiter.penalize(45_000)
    await vi.advanceTimersByTimeAsync(8_001)
    expect(settled).toBeInstanceOf(RateLimitedError)
  })

  it('runs a queued call whose deadline falls exactly when a slot frees', async () => {
    const { limiter, calls, call } = setup({ budget: 1 })
    await limiter.schedule('interactive', call())
    const job = limiter.schedule('interactive', call(), { maxWaitMs: WINDOW })
    await vi.advanceTimersByTimeAsync(WINDOW)
    await expect(job).resolves.toBe(0)
    expect(calls).toHaveLength(2)
  })

  it('never pauses for less than the backoff step, even if the header says 0', () => {
    const { limiter } = setup()
    limiter.penalize(0)
    expect(limiter.snapshot().blockedForMs).toBe(2_000)
  })

  it('pauses when the upstream says its budget is spent, even with a reset of 0', async () => {
    const { limiter, calls, call } = setup()
    limiter.sync(0, 0)
    expect(limiter.snapshot().blockedForMs).toBeGreaterThan(0)
    const job = limiter.schedule('interactive', call())
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_000)
    await job
    expect(calls).toHaveLength(1)
  })

  it('reports a snapshot of the budget', async () => {
    const { limiter, call } = setup()
    await limiter.schedule('interactive', call())
    vi.advanceTimersByTime(20_000)
    expect(limiter.snapshot()).toEqual({
      budget: 14,
      remaining: 13,
      resetsInMs: 40_000,
      queued: 0,
      blockedForMs: 0,
    })
  })
})
