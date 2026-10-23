// Fixed-window rate limiter with priority lanes. Pure: the clock and timers are injectable so it
// can be tested with fake timers. Shared by every upstream call in this server process.

export type Lane = 'write' | 'interactive' | 'background'

const LANE_ORDER: readonly Lane[] = ['write', 'interactive', 'background']

export interface RateLimiterOptions {
  /** Requests allowed per window. */
  budget: number
  windowMs: number
  /** Interactive/write callers are rejected instead of queued when the estimated wait exceeds this. */
  maxWaitMs: number
  /** Background work only runs while more than this many requests remain in the window. */
  backgroundReserve?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface ScheduleOptions {
  /** Overrides the limiter's maxWaitMs for this call. Background calls default to no limit. */
  maxWaitMs?: number
}

export interface RateLimitSnapshot {
  budget: number
  remaining: number
  resetsInMs: number
  queued: number
  blockedForMs: number
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limit reached, retry in ${Math.ceil(retryAfterMs / 1000)}s`)
    this.name = 'RateLimitedError'
  }
}

interface Job {
  lane: Lane
  run: () => void
  reject: (err: unknown) => void
  deadline: number
}

/** Escalating pauses after consecutive upstream 429s (no Retry-After is documented). */
const PENALTY_STEPS_MS = [2_000, 5_000, 15_000, 60_000]

export function createRateLimiter(opts: RateLimiterOptions) {
  const now = opts.now ?? Date.now
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>))
  const reserve = opts.backgroundReserve ?? 3

  const queues: Record<Lane, Job[]> = { write: [], interactive: [], background: [] }
  let windowStart = now()
  let used = 0
  let blockedUntil = 0
  let consecutivePenalties = 0
  let timer: unknown = null

  function rollWindow(t: number) {
    if (t >= windowStart + opts.windowMs) {
      // Align to the window grid so the reset time stays predictable.
      const elapsedWindows = Math.floor((t - windowStart) / opts.windowMs)
      windowStart += elapsedWindows * opts.windowMs
      used = 0
    }
  }

  function remainingFor(lane: Lane) {
    const left = opts.budget - used
    return lane === 'background' ? left - reserve : left
  }

  function queuedCount() {
    return queues.write.length + queues.interactive.length + queues.background.length
  }

  function nextJob(): Job | undefined {
    for (const lane of LANE_ORDER) {
      if (queues[lane].length && remainingFor(lane) > 0) return queues[lane].shift()
    }
    return undefined
  }

  function msUntilNextSlot(t: number) {
    if (t < blockedUntil) return blockedUntil - t
    return windowStart + opts.windowMs - t
  }

  function expireOverdue(t: number) {
    for (const lane of LANE_ORDER) {
      queues[lane] = queues[lane].filter((job) => {
        if (job.deadline >= t) return true
        job.reject(new RateLimitedError(msUntilNextSlot(t)))
        return false
      })
    }
  }

  function pump() {
    timer = null
    const t = now()
    if (t >= blockedUntil) rollWindow(t)
    expireOverdue(t)

    if (t >= blockedUntil) {
      let job = nextJob()
      while (job) {
        used++
        job.run()
        job = nextJob()
      }
    }

    if (queuedCount() > 0 && timer === null) {
      timer = setTimer(pump, Math.max(1, msUntilNextSlot(now())))
    }
  }

  /** Estimated ms until a new job in `lane` would start, given who is already queued ahead. */
  function estimateWait(lane: Lane) {
    const t = now()
    if (t >= blockedUntil) rollWindow(t)
    const laneIndex = LANE_ORDER.indexOf(lane)
    const ahead = LANE_ORDER.slice(0, laneIndex + 1).reduce((n, l) => n + queues[l].length, 0)
    const perWindow = lane === 'background' ? opts.budget - reserve : opts.budget
    const start = Math.max(t, blockedUntil)
    const availableNow = t >= blockedUntil ? remainingFor(lane) : 0
    if (ahead < availableNow) return start - t
    const firstReset = t >= blockedUntil ? windowStart + opts.windowMs : blockedUntil
    const extraWindows = Math.floor((ahead - Math.max(availableNow, 0)) / Math.max(perWindow, 1))
    return firstReset - t + extraWindows * opts.windowMs
  }

  function schedule<T>(lane: Lane, fn: () => Promise<T>, scheduleOpts: ScheduleOptions = {}): Promise<T> {
    const maxWait = scheduleOpts.maxWaitMs ?? (lane === 'background' ? Infinity : opts.maxWaitMs)
    const wait = estimateWait(lane)
    if (wait > maxWait) return Promise.reject(new RateLimitedError(wait))

    return new Promise<T>((resolve, reject) => {
      queues[lane].push({
        lane,
        deadline: now() + maxWait,
        reject,
        run: () => {
          fn().then(resolve, reject)
        },
      })
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      pump()
    })
  }

  /** Call after an upstream 429: pauses all lanes with an escalating backoff. */
  function penalize(retryAfterMs?: number) {
    const step = PENALTY_STEPS_MS[Math.min(consecutivePenalties, PENALTY_STEPS_MS.length - 1)]!
    consecutivePenalties++
    const t = now()
    blockedUntil = Math.max(blockedUntil, t + (retryAfterMs ?? step))
    // When the pause ends, start a fresh window rather than trusting our stale count.
    windowStart = blockedUntil
    used = 0
    if (timer !== null) clearTimer(timer)
    timer = setTimer(pump, blockedUntil - t)
  }

  /** Call after a successful upstream response. */
  function recordSuccess() {
    consecutivePenalties = 0
  }

  function snapshot(): RateLimitSnapshot {
    const t = now()
    if (t >= blockedUntil) rollWindow(t)
    const blockedForMs = Math.max(0, blockedUntil - t)
    return {
      budget: opts.budget,
      remaining: blockedForMs > 0 ? 0 : Math.max(0, opts.budget - used),
      resetsInMs: blockedForMs > 0 ? blockedForMs : Math.max(0, windowStart + opts.windowMs - t),
      queued: queuedCount(),
      blockedForMs,
    }
  }

  return { schedule, penalize, recordSuccess, snapshot }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
