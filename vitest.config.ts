import { defineVitestConfig } from '@nuxt/test-utils/config'

// Fixed TZ with DST so time tests are meaningful and deterministic.
process.env.TZ = 'Europe/Berlin'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['tests/**/*.test.ts'],
    environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
  },
})
