#!/usr/bin/env node
// Stop hook: if source files changed, run typecheck + unit tests before Claude finishes.
// Exit 2 keeps Claude working with the failure output. Skips on the second pass to avoid loops.
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (input.stop_hook_active) process.exit(0)
if (!existsSync(join(root, 'node_modules'))) process.exit(0)

const changed = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout ?? ''
if (!/\.(ts|vue)$/m.test(changed)) process.exit(0)

for (const script of ['typecheck', 'test']) {
  const res = spawnSync('npm', ['run', '--silent', script], { cwd: root, encoding: 'utf8' })
  if (res.status !== 0) {
    console.error(`npm run ${script} failed; fix before finishing:\n${(res.stdout + res.stderr).slice(-4000)}`)
    process.exit(2)
  }
}
