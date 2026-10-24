// In a larger app I would use TanStack Query (@tanstack/vue-query): it drops stale answers,
// cancels old requests, retries and caches for every query. Here the scope is small, so I chose
// a small in-house substitute instead of a new dependency. This file is that substitute.

export interface RequestTicket {
  /** Pass to $fetch, so an invalidated request is cancelled in the browser. */
  signal: AbortSignal
  /** False once the guard (or an `also` guard) was invalidated after this request started. */
  isCurrent: () => boolean
  /** Call when the request settles, so invalidate() doesn't hold on to it. */
  done: () => void
}

export interface RequestGuard {
  generation: Readonly<Ref<number>>
  start: (opts?: { also?: RequestGuard[] }) => RequestTicket
  startLatest: (opts?: { also?: RequestGuard[] }) => RequestTicket
  invalidate: () => void
  /** Internal: lets a ticket from another guard be cancelled by this one. */
  track: (controller: AbortController) => () => void
}

// AbortControllers can't live in useState (not serialisable), and requests only run in the
// browser, so they are kept per key here. Same reason the catalog keeps its timers outside state.
const controllersByKey = new Map<string, Set<AbortController>>()

/**
 * One rule for "is this answer still wanted?". Every request takes a ticket; invalidate() bumps
 * the generation, so older tickets stop being current, and aborts them. Shared by `key`, so a
 * Refresh button and the tree that loads nodes see the same guard.
 */
export function useRequestGuard(key: string): RequestGuard {
  const generation = useState(`request-guard:${key}`, () => 0)

  function controllers() {
    let set = controllersByKey.get(key)
    if (!set) controllersByKey.set(key, set = new Set())
    return set
  }

  function track(controller: AbortController) {
    if (!import.meta.client) return () => {}
    const set = controllers()
    set.add(controller)
    return () => set.delete(controller)
  }

  function invalidate() {
    generation.value++
    const set = controllers()
    for (const controller of set) controller.abort()
    set.clear()
  }

  const guard: RequestGuard = {
    generation: readonly(generation),
    invalidate,
    track,
    start({ also = [] } = {}) {
      const controller = new AbortController()
      const guards = [guard, ...also]
      const started = guards.map(g => g.generation.value)
      const untrack = guards.map(g => g.track(controller))
      return {
        signal: controller.signal,
        isCurrent: () => !controller.signal.aborted && guards.every((g, i) => g.generation.value === started[i]),
        done: () => untrack.forEach(fn => fn()),
      }
    },
    /** Starts a request that replaces every older one under this key (a new page replaces the last). */
    startLatest(opts) {
      invalidate()
      return guard.start(opts)
    },
  }
  return guard
}
