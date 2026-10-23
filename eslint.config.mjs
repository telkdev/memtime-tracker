import withNuxt from './.nuxt/eslint.config.mjs'

// Hard rules from CLAUDE.md that a linter can check. A rule enforced here can't be forgotten by a
// person or by an agent, which is cheaper than catching it in review.
const keyAccess = {
  // Covers config.memtimeApiKey and const { memtimeApiKey } = useRuntimeConfig().
  selector: 'MemberExpression[property.name=\'memtimeApiKey\'], ObjectPattern > Property[key.name=\'memtimeApiKey\']',
  message: 'Only server/utils/memtime.ts may read the API key (CLAUDE.md hard rule 1).',
}
const upstreamUrl = {
  selector: 'Literal[value=/memtime-demo\\.deno\\.net/]',
  message: 'Call the upstream only through server/utils/memtime.ts; the base URL lives in runtimeConfig (hard rule 2).',
}

export default withNuxt(
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': ['error', keyAccess, upstreamUrl],
      'vue/no-v-html': 'error',
    },
  },
  {
    // Components render and emit; data fetching lives in composables (.claude/rules/vue-conventions.md).
    files: ['app/components/**', 'app/pages/**'],
    rules: {
      'no-restricted-syntax': ['error', keyAccess, upstreamUrl, {
        selector: 'CallExpression[callee.name=\'$fetch\']',
        message: 'Components and pages don\'t call $fetch. Put the request in a composable.',
      }],
    },
  },
  {
    files: ['server/utils/memtime.ts', 'nuxt.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
)
