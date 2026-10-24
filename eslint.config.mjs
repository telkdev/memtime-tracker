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
    // Requests live in api/ folders only, so every one passes `retry: 0` and is easy to find and mock.
    files: ['app/**'],
    ignores: ['app/**/api/**'],
    rules: {
      'no-restricted-syntax': ['error', keyAccess, upstreamUrl, {
        selector: 'CallExpression[callee.name=\'$fetch\']',
        message: 'Only files in an api/ folder call $fetch. Add a function there and call it.',
      }],
    },
  },
  {
    // Feature boundaries (app/features/README.md): another feature is used only through its index.ts.
    files: ['app/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { regex: '^[~@]/features/[^/]+/.', message: 'Import a feature through its index: \'~/features/<name>\'.' },
        { regex: '^[~@]/common/.', message: 'Import common code through its index: \'~/common\'.' },
      ] }],
    },
  },
  {
    // Inside a feature, a path that climbs out of it (../../) reaches into another feature or common.
    files: ['app/features/**', 'app/common/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { regex: '^[~@]/features/[^/]+/.', message: 'Import a feature through its index: \'~/features/<name>\'.' },
        { regex: '^[~@]/common/.', message: 'Import common code through its index: \'~/common\'.' },
        { regex: '^(\\.\\./){2,}(?!\\.\\./)', message: 'Don\'t reach out of this folder with ../../. Use \'~/features/<name>\' or \'~/common\'.' },
      ] }],
    },
  },
  {
    // common/ is the bottom layer: if it imported a feature, features could import each other in a circle.
    files: ['app/common/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { regex: '^[~@]/features', message: 'common/ never imports a feature.' },
        { regex: '^(\\.\\./){2,}(?!\\.\\./)', message: 'Don\'t reach out of common/ with ../../.' },
      ] }],
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
