// Process-wide singletons wiring the upstream client to runtime config. Every upstream call goes
// through useMemtime(); nothing else reads the API key.
import { createCache, type Cache } from './cache'
import { createMemtimeClient, type MemtimeClient } from './memtime-client'
import { createRateLimiter, type RateLimiter } from './rate-limiter'

let limiter: RateLimiter | undefined
let client: MemtimeClient | undefined
let cache: Cache | undefined

/** Catalog data (clients, projects, tasks) changes rarely. */
export const CATALOG_TTL_MS = 5 * 60_000
export const CATALOG_STALE_MS = 10 * 60_000

export function useRateLimiter(): RateLimiter {
  limiter ??= createRateLimiter(useRuntimeConfig().rateLimit)
  return limiter
}

export function useServerCache(): Cache {
  cache ??= createCache()
  return cache
}

export function useMemtime(): MemtimeClient {
  if (!client) {
    const config = useRuntimeConfig()
    client = createMemtimeClient({
      baseUrl: config.memtimeBaseUrl,
      apiKey: config.memtimeApiKey,
      limiter: useRateLimiter(),
    })
  }
  return client
}

/** Throws with an actionable message when the server can't talk to the API at all. */
export function assertMemtimeConfig() {
  const config = useRuntimeConfig()
  if (!config.memtimeApiKey) {
    throw new Error('NUXT_MEMTIME_API_KEY is not set. Copy .env.example to .env and add your API key.')
  }
  // Plain http is only fine for a local stand-in (npm run mock:api, npm run smoke).
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(config.memtimeBaseUrl)
  if (!/^https:\/\//.test(config.memtimeBaseUrl) && !local && !import.meta.dev) {
    throw new Error('NUXT_MEMTIME_BASE_URL must use https outside localhost.')
  }
}
