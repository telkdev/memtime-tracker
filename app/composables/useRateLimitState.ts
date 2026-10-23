import type { RateLimitSnapshot } from '../../server/utils/rate-limiter'

/** The BFF's local request budget, for the small indicator in the UI. Reading it is free. */
export function useRateLimitState() {
  const snapshot = useState<(RateLimitSnapshot & { at: number }) | null>('rate-limit:snapshot', () => null)

  async function refreshSnapshot() {
    try {
      const s = await $fetch<RateLimitSnapshot>('/api/_meta/rate-limit', { retry: 0 })
      snapshot.value = { ...s, at: Date.now() }
    }
    catch {
      // Purely informational; keep the last value.
    }
  }

  return { snapshot: readonly(snapshot), refreshSnapshot }
}
