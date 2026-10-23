// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxt/test-utils/module'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  // System font stack: no third-party font requests (privacy, offline, desktop app).
  ui: { fonts: false },
  runtimeConfig: {
    // Private: only available on the server. Set via NUXT_MEMTIME_API_KEY.
    memtimeApiKey: '',
    memtimeBaseUrl: 'https://interview-api.memtime-demo.deno.net/api/v1',
    rateLimit: {
      // Upstream allows 15/60s; one request is kept spare for clock skew.
      budget: 14,
      windowMs: 60_000,
      maxWaitMs: 8_000,
    },
    public: {},
  },
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
      },
    },
  },
  compatibilityDate: '2026-10-01',
  typescript: { strict: true },
  eslint: { config: { stylistic: true } },
})
