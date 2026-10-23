// In-memory TTL cache with in-flight coalescing and stale-while-revalidate.
// Single-instance only; a multi-instance deployment would move this to Redis/KV.

interface Entry {
  value: unknown
  freshUntil: number
  staleUntil: number
}

export interface CachedOptions {
  /** How long a value is served without refetching. */
  ttlMs: number
  /** After ttlMs, serve the stale value for this long while refreshing in the background. */
  staleMs?: number
  /** Skip the cached value (still coalesces with an in-flight fetch). */
  force?: boolean
}

export function createCache(opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<unknown>>()

  function load<T>(key: string, fn: () => Promise<T>, o: CachedOptions): Promise<T> {
    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>

    const p = fn()
      .then((value) => {
        const t = now()
        entries.set(key, { value, freshUntil: t + o.ttlMs, staleUntil: t + o.ttlMs + (o.staleMs ?? 0) })
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  }

  /** Returns the cached value for `key`, or runs `fn` once for all concurrent callers. Errors are never cached. */
  async function cached<T>(key: string, fn: () => Promise<T>, o: CachedOptions): Promise<T> {
    const entry = entries.get(key)
    const t = now()
    if (entry && !o.force) {
      if (t < entry.freshUntil) return entry.value as T
      if (t < entry.staleUntil) {
        // Serve stale, refresh quietly; a failed refresh keeps the stale value.
        load(key, fn, o).catch(() => {})
        return entry.value as T
      }
    }
    return load(key, fn, o)
  }

  function invalidate(key: string) {
    entries.delete(key)
  }

  function invalidatePrefix(prefix: string) {
    for (const key of entries.keys()) {
      if (key.startsWith(prefix)) entries.delete(key)
    }
  }

  function clear() {
    entries.clear()
  }

  return { cached, invalidate, invalidatePrefix, clear }
}

export type Cache = ReturnType<typeof createCache>
