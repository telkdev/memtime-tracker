// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxt/test-utils/module'],
  // Our own code is imported explicitly, through each feature's index.ts (app/features/README.md).
  // Auto-importing it would let any file reach a feature's internals and make the index pointless.
  // Vue, Nuxt and Nuxt UI (UButton, ...) are still auto-imported.
  components: [],
  imports: { scan: false },
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  // System font stack: no third-party font requests (privacy, offline, desktop app).
  ui: { fonts: false },
  runtimeConfig: {
    // Private: only available on the server. Set via NUXT_MEMTIME_API_KEY.
    memtimeApiKey: '',
    memtimeBaseUrl: 'https://interview-api.memtime-demo.deno.net/api/v1',
    // OAuth 2.0 login, with Memtime as the authorization server. All private. Login is on only
    // when NUXT_CLIENT_ID is set; without it the app runs on the API key (mock API, smoke).
    // Read only in server/utils/auth-config.ts.
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    authBaseUrl: '',
    authScope: '',
    // Encrypts tokens at rest. NUXT_SESSION_SECRET, 32+ characters.
    sessionSecret: '',
    rateLimit: {
      // Upstream allows 15/60s; one request is kept spare for clock skew.
      budget: 14,
      windowMs: 60_000,
      maxWaitMs: 8_000,
    },
    public: {},
  },
  routeRules: {
    // The entry form works in the user's local time, which the server doesn't know. Rendering it
    // on the server would compute defaults in the server's zone and cause hydration mismatches.
    '/entries/**': { ssr: false },
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
      },
    },
  },
  compatibilityDate: '2026-10-01',
  nitro: {
    // Users and login sessions. A file store is right for one instance; with several, mount
    // Redis/Upstash here instead (same reasoning as the rate limiter and cache).
    storage: { auth: { driver: 'fs', base: './.data/auth' } },
  },
  typescript: { strict: true },
  eslint: { config: { stylistic: true } },
})
