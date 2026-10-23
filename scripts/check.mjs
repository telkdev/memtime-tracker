#!/usr/bin/env node
// One command for lint (with autofix), typecheck and tests. Prints one line per passing step and
// only the tail of the output for a failing one, to keep logs and Claude's context small.
// Usage: npm run check            (all steps)
//        npm run check -- lint    (subset: lint | typecheck | test)
//        npm run check -- --no-fix  (report lint errors without fixing; the default in CI and for
//                                    the QA agent, so a green run means the committed code is clean)
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const fix = !args.includes('--no-fix') && !process.env.CI

const steps = {
  lint: ['npx', ['eslint', '.', ...(fix ? ['--fix'] : [])]],
  typecheck: ['npx', ['nuxi', 'typecheck']],
  test: ['npx', ['vitest', 'run', '--reporter=dot']],
}
const wanted = args.filter(s => s in steps)
let failed = false

for (const name of wanted.length ? wanted : Object.keys(steps)) {
  const [cmd, args] = steps[name]
  const started = Date.now()
  const res = spawnSync(cmd, args, { encoding: 'utf8' })
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  if (res.status === 0) {
    console.log(`✓ ${name} (${secs}s)`)
    continue
  }
  failed = true
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n')
  console.log(`✗ ${name} (${secs}s)\n${out}\n`)
}

process.exit(failed ? 1 : 0)
