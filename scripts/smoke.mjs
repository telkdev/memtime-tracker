#!/usr/bin/env node
// End-to-end smoke test of the built app against the local mock API. Never touches the real API.
// It builds the app, starts the mock and the production server on free ports, and checks the
// guarantees reviewers care about most: the key never reaches the browser, every error has the
// BFF shape, and a burst of requests never makes the upstream answer 429.
//
// Usage: npm run smoke                 (builds first)
//        SMOKE_SKIP_BUILD=1 npm run smoke
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
// Distinctive, so a leak is unambiguous. The mock echoes it back in every entry's userId.
const KEY = `smoke-${randomBytes(16).toString('hex')}`
const results = []
const children = []

function check(name, ok, detail = '') {
  results.push({ name, status: ok ? 'pass' : 'fail', detail })
}
function skip(name, detail) {
  results.push({ name, status: 'skip', detail })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    }).on('error', reject)
  })
}

function start(cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.log = ''
  child.stdout.on('data', d => (child.log += d))
  child.stderr.on('data', d => (child.log += d))
  children.push(child)
  return child
}

async function waitFor(url, child, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`process exited early:\n${child.log.slice(-2000)}`)
    try {
      await fetch(url)
      return
    }
    catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function call(base, path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  }
  catch {
    json = undefined
  }
  return { status: res.status, headers: res.headers, text, json }
}

const isBffError = r => typeof r.json?.error?.code === 'string' && typeof r.json.error.message === 'string'
const routeMissing = r => r.status === 404 && /^No API route/.test(r.json?.error?.message ?? '')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** The real key from .env, if this machine has one, so the bundle scan can look for it too. */
function envKey() {
  const env = join(root, '.env')
  if (!existsSync(env)) return ''
  return readFileSync(env, 'utf8').match(/^NUXT_MEMTIME_API_KEY=(.+)$/m)?.[1]?.trim() ?? ''
}

async function main() {
  if (!process.env.SMOKE_SKIP_BUILD) {
    const build = spawnSync('npx', ['nuxt', 'build'], { cwd: root, encoding: 'utf8' })
    if (build.status !== 0) throw new Error(`nuxt build failed:\n${(build.stdout + build.stderr).slice(-3000)}`)
  }
  if (!existsSync(join(root, '.output/server/index.mjs'))) throw new Error('.output is missing; run without SMOKE_SKIP_BUILD')

  // 1. The client bundle must not mention the key, by value or by config name.
  const publicFiles = walk(join(root, '.output/public')).filter(f => /\.(js|mjs|html|json|css)$/.test(f))
  const needles = ['memtimeApiKey', envKey()].filter(Boolean)
  const leaks = publicFiles.filter(f => needles.some(n => readFileSync(f, 'utf8').includes(n)))
  check('client bundle has no API key or key config name', leaks.length === 0, leaks.join(', '))

  const mockPort = await freePort()
  const appPort = await freePort()
  const upstream = `http://127.0.0.1:${mockPort}/api/v1`
  // Counted by the mock itself, so a window reset can't hide a spent request.
  const upstreamRequests = async () => Number(await (await fetch(`http://127.0.0.1:${mockPort}/__requests`)).text())
  const mock = start('node', ['scripts/mock-api.mjs', String(mockPort)], { MOCK_LATENCY_MS: '20' })
  await waitFor(`http://127.0.0.1:${mockPort}/health`, mock)

  // Seed entries straight on the mock. These 3 calls also spend the shared upstream budget the way
  // another client of the same key would, so the BFF must sync from ratelimit-remaining.
  for (let i = 0; i < 3; i++) {
    const start = new Date(Date.UTC(2026, 9, 20 + i, 8)).toISOString()
    const end = new Date(Date.UTC(2026, 9, 20 + i, 9, 30)).toISOString()
    await fetch(`${upstream}/time-entries`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 1001, comment: `seed ${i}`, start, end }),
    })
  }

  const app = start('node', ['.output/server/index.mjs'], {
    PORT: String(appPort),
    HOST: '127.0.0.1',
    NUXT_MEMTIME_API_KEY: KEY,
    NUXT_MEMTIME_BASE_URL: upstream,
    NUXT_RATE_LIMIT_MAX_WAIT_MS: '1500',
  })
  const base = `http://127.0.0.1:${appPort}`
  await waitFor(`${base}/api/_meta/rate-limit`, app)

  // 2. Pages and headers.
  const home = await call(base, '/')
  check('GET / renders', home.status === 200, `status ${home.status}`)
  check('GET / has no key', !home.text.includes(KEY))
  check('security headers set', home.headers.get('x-content-type-options') === 'nosniff'
  && home.headers.get('x-frame-options') === 'DENY')

  // 3. Catalog reads.
  const clients = await call(base, '/api/clients')
  check('GET /api/clients returns a page', clients.status === 200 && Array.isArray(clients.json?.items), `status ${clients.status}`)
  const projects = await call(base, '/api/clients/1/projects')
  check('GET /api/clients/1/projects returns a page', projects.status === 200 && projects.json?.items?.length > 0)
  const projectId = projects.json?.items?.[0]?.id
  const tasks = await call(base, `/api/projects/${projectId}/tasks`)
  check('GET /api/projects/:id/tasks returns a page', tasks.status === 200 && tasks.json?.items?.length > 0)

  // 4. Time entries: userId (the raw key) must be stripped.
  const entries = await call(base, '/api/time-entries')
  check('GET /api/time-entries returns seeded entries', entries.status === 200 && entries.json?.items?.length === 3, `status ${entries.status}`)
  check('time entries contain no key', !entries.text.includes(KEY))
  check('time entries have no userId field', !entries.json?.items?.some(e => 'userId' in e))
  check('time entries are Cache-Control: no-store', entries.headers.get('cache-control') === 'no-store')

  // 5. Errors keep the BFF shape and bad input costs no upstream call.
  const badId = await call(base, '/api/tasks/abc')
  check('bad id → 400 VALIDATION', badId.status === 400 && badId.json?.error?.code === 'VALIDATION')
  const missingTask = await call(base, '/api/tasks/999999')
  check('unknown task → 404 NOT_FOUND', missingTask.status === 404 && missingTask.json?.error?.code === 'NOT_FOUND')
  // An oversized page is refused by the query schema; the limiter must not have spent a token.
  const before = await upstreamRequests()
  const oversized = await call(base, '/api/time-entries?limit=1000')
  const after = await upstreamRequests()
  check('oversized page → 400 VALIDATION', oversized.status === 400 && oversized.json?.error?.code === 'VALIDATION', `status ${oversized.status}`)
  check('oversized page costs no upstream call', after === before, `${before} → ${after} upstream requests`)
  const unknown = await call(base, '/api/nope')
  check('unknown API route → BFF 404 shape', unknown.status === 404 && isBffError(unknown))

  // 6. Writes and reading one entry (Task 3).
  const empty = await call(base, '/api/time-entries', { method: 'POST', body: '{}' })
  if (routeMissing(empty)) {
    skip('POST /api/time-entries checks', 'route not implemented yet')
  }
  else {
    check('POST {} → 400 with field errors', empty.status === 400 && isBffError(empty) && !!empty.json.error.fields)
    const beforeBad = await upstreamRequests()
    await call(base, '/api/time-entries', { method: 'POST', body: JSON.stringify({ taskId: 1001, comment: '', start: 'yesterday', end: 'now' }) })
    const afterBad = await upstreamRequests()
    check('invalid POST costs no upstream call', afterBad === beforeBad, `${beforeBad} → ${afterBad} upstream requests`)
    const notJson = await call(base, '/api/time-entries', { method: 'POST', body: '{not json' })
    check('POST invalid JSON → 400 BFF shape', notJson.status === 400 && isBffError(notJson))
    const body = JSON.stringify({ taskId: 1001, comment: 'Smoke test', start: '2026-10-22T08:00:00.000Z', end: '2026-10-22T09:30:00.000Z' })
    const created = await call(base, '/api/time-entries', { method: 'POST', body })
    check('POST valid entry → 2xx with id', created.status >= 200 && created.status < 300 && Number.isInteger(created.json?.id ?? created.json?.entry?.id), `status ${created.status}`)
    check('POST response has no key', !created.text.includes(KEY))
    const put = await call(base, '/api/time-entries/999999', { method: 'PUT', body })
    check('PUT unknown entry → 404 NOT_FOUND', put.status === 404 && put.json?.error?.code === 'NOT_FOUND')
    const id = created.json?.entry?.id
    const one = await call(base, `/api/time-entries/${id}`)
    check('GET /api/time-entries/:id returns the entry without userId or key', one.status === 200 && one.json?.entry?.id === id
    && !('userId' in (one.json?.entry ?? {})) && !one.text.includes(KEY), `status ${one.status}`)
    const edited = JSON.stringify({ taskId: 1001, comment: 'Smoke test (edited)', start: '2026-10-22T08:00:00.000Z', end: '2026-10-22T10:00:00.000Z' })
    const updated = await call(base, `/api/time-entries/${id}`, { method: 'PUT', body: edited })
    check('PUT existing entry → 200 with the updated entry', updated.status === 200 && updated.json?.entry?.comment === 'Smoke test (edited)'
    && updated.json.entry.end === '2026-10-22T10:00:00.000Z' && !('userId' in updated.json.entry) && !updated.text.includes(KEY), `status ${updated.status}`)
    const gone = await call(base, '/api/time-entries/999999')
    check('GET unknown entry → 404 NOT_FOUND', gone.status === 404 && gone.json?.error?.code === 'NOT_FOUND')
  }

  // 7. Burst: 20 distinct list pages at once. The BFF must answer each one with data or a 429 that
  // carries retryAfter, and must never let the upstream reach its own limit.
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => call(base, `/api/time-entries?limit=1&offset=${i + 10}`)))
  const bad = burst.filter(r => !(r.status === 200 || (r.status === 429 && r.json?.error?.retryAfter > 0)))
  check('burst: every reply is data or 429 with retryAfter', bad.length === 0, bad.map(r => r.status).join(','))
  check('burst: some requests were held back', burst.some(r => r.status === 429))
  check('upstream never answered 429', !/→ 429/.test(app.log), app.log.match(/.*→ 429.*/)?.[0] ?? '')
  check('server log never contains the key', !app.log.includes(KEY))
}

try {
  await main()
}
catch (err) {
  check('smoke run completed', false, err instanceof Error ? err.message : String(err))
}
finally {
  for (const c of children) c.kill()
}

for (const r of results) {
  const mark = { pass: '✓', fail: '✗', skip: '–' }[r.status]
  console.log(`${mark} ${r.name}${r.detail && r.status !== 'pass' ? ` (${r.detail})` : ''}`)
}
const failed = results.filter(r => r.status === 'fail').length
console.log(`\n${results.length - failed} of ${results.length} smoke checks passed or skipped`)
process.exit(failed ? 1 : 0)
