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

  it('never runs more than the budget in any window, even with 50 concurrent callers', async () => {
    const { limiter, calls, call } = setup()
    const jobs = Array.from({ length: 50 }, (_, i) => limiter.schedule('background', call(i)))

    await vi.advanceTimersByTimeAsync(5 * WINDOW)
    await Promise.all(jobs)

    expect(calls).toHaveLength(50)
    for (const t of calls) {
      const inWindow = calls.filter(c => c >= t && c < t + WINDOW)
      expect(inWindow.length).toBeLessThanOrEqual(14)
    }
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

    await vi.advanceTimersByTimeAsync(WINDOW)
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
