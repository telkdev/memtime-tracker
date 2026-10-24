import type { RateLimitSnapshot } from '~~/server/utils/rate-limiter'

// Every $fetch in app/ lives in an api/ folder (ESLint enforces it). All pass `retry: 0`: ofetch
// would otherwise retry 429/5xx at once, which only burns the shared budget.

/** The BFF's local request budget. Costs no upstream call. */
export function fetchRateLimit() {
  return $fetch<RateLimitSnapshot>('/api/_meta/rate-limit', { retry: 0 })
}
