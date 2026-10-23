#!/usr/bin/env node
// Local stand-in for the Memtime API, following API_V1_DOCUMENTATION.md: bare-array lists with
// limit/offset/sortBy/order, `{ error }` bodies, a 15 req/60s limit, and userId echoing the key.
// Lets you develop and demo without spending the real budget.
//   node scripts/mock-api.mjs [port]   then   NUXT_MEMTIME_BASE_URL=http://localhost:4010/api/v1
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 4010)
const LIMIT = Number(process.env.MOCK_RATE_LIMIT ?? 15)
const WINDOW_MS = 60_000
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 250)

const ts = d => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString()
const clients = [
  { id: 1, name: 'Acme Corp', description: 'Long-running retainer', status: 'active' },
  { id: 2, name: 'Globex', description: 'Website relaunch', status: 'active' },
  { id: 3, name: 'Initech', description: 'Legacy support', status: 'archived' },
  { id: 4, name: 'Umbrella Health', description: 'No projects yet', status: 'active' },
  { id: 5, name: 'Stark Industries', description: '', status: 'active' },
].map((c, i) => ({ ...c, createdAt: ts(i), updatedAt: ts(i) }))

const projects = []
const tasks = []
let projectId = 100
let taskId = 1000
const plan = { 1: ['Mobile app', 'Internal tools', 'Support'], 2: ['Relaunch 2026', 'SEO audit'], 3: ['Maintenance'], 5: ['Arc reactor', 'Bulk import'] }
for (const [clientId, names] of Object.entries(plan)) {
  for (const name of names) {
    const project = { id: ++projectId, clientId: Number(clientId), name, status: name === 'Maintenance' ? 'archived' : 'active', createdAt: ts(10), updatedAt: ts(10) }
    projects.push(project)
    const count = name === 'Bulk import' ? 130 : 3 + (projectId % 3)
    let firstOfProject = 0
    for (let i = 1; i <= count; i++) {
      const id = ++taskId
      if (i === 1) firstOfProject = id
      // A couple of subtasks to exercise `parent`.
      const parent = name === 'Mobile app' && i > 3 ? firstOfProject : 0
      tasks.push({ id, projectId: project.id, parent, name: name === 'Bulk import' ? `Import batch ${String(i).padStart(3, '0')}` : ['Design', 'Development', 'Code review', 'QA', 'Meetings', 'Planning'][i - 1] ?? `Task ${i}`, status: 'active', createdAt: ts(20), updatedAt: ts(20) })
    }
  }
}
const entries = []

let windowStart = Date.now()
let used = 0
function rateLimited() {
  const now = Date.now()
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now
    used = 0
  }
  return ++used > LIMIT
}

function list(rows, query) {
  const limit = Number(query.get('limit') ?? 10)
  const offset = Number(query.get('offset') ?? 0)
  const sortBy = query.get('sortBy')
  const order = query.get('order') === 'desc' ? -1 : 1
  const sorted = sortBy ? [...rows].sort((a, b) => (a[sortBy] > b[sortBy] ? order : -order)) : rows
  return sorted.slice(offset, offset + limit)
}

// Tasks carry no projectId upstream; the mock keeps it internally for filtering.
// eslint-disable-next-line no-unused-vars
const strip = ({ projectId: _projectId, ...task }) => task

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body, null, 2))
  }
  await new Promise(r => setTimeout(r, LATENCY_MS))

  if (url.pathname === '/health') return res.end('I\'m alive!')
  const key = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!key) return send(404, { error: 'Unknown user' })
  if (rateLimited()) return send(429, { error: 'Too many requests' })

  const path = url.pathname.replace(/^\/api\/v1/, '')
  const q = url.searchParams
  let m
  if (req.method === 'GET' && path === '/clients') return send(200, list(clients, q))
  if (req.method === 'GET' && (m = path.match(/^\/clients\/(\d+)\/projects$/))) return send(200, list(projects.filter(p => p.clientId === Number(m[1])), q))
  if (req.method === 'GET' && (m = path.match(/^\/projects\/(\d+)\/tasks$/))) return send(200, list(tasks.filter(t => t.projectId === Number(m[1])).map(strip), q))
  if (req.method === 'GET' && (m = path.match(/^\/clients\/(\d+)$/))) {
    const c = clients.find(x => x.id === Number(m[1]))
    return c ? send(200, c) : send(404, { error: 'Client not found' })
  }
  if (req.method === 'GET' && (m = path.match(/^\/tasks\/(\d+)$/))) {
    const t = tasks.find(x => x.id === Number(m[1]))
    return t ? send(200, strip(t)) : send(404, { error: 'Task not found' })
  }
  if (req.method === 'GET' && path === '/time-entries') return send(200, list(entries.filter(e => e.userId === key), q))
  if ((m = path.match(/^\/time-entries\/(\d+)$/)) && req.method === 'GET') {
    const e = entries.find(x => x.id === Number(m[1]) && x.userId === key)
    return e ? send(200, e) : send(404, { error: 'Time entry not found' })
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    let body
    try {
      body = JSON.parse(await new Promise((r) => {
        let s = ''
        req.on('data', d => (s += d)).on('end', () => r(s))
      }))
    }
    catch {
      return send(400, { error: 'Invalid JSON body' })
    }
    const missing = ['taskId', 'comment', 'start', 'end'].filter(f => body[f] === undefined)
    if (missing.length) return send(400, { error: `Missing required fields: ${missing.join(', ')}` })
    const now = new Date().toISOString()
    if (req.method === 'POST' && path === '/time-entries') {
      const entry = { id: entries.length + 1, taskId: body.taskId, userId: key, comment: body.comment, start: body.start, end: body.end, createdAt: now, updatedAt: now }
      entries.push(entry)
      return send(201, entry)
    }
    if ((m = path.match(/^\/time-entries\/(\d+)$/))) {
      const e = entries.find(x => x.id === Number(m[1]) && x.userId === key)
      if (!e) return send(404, { error: `Time entry #${m[1]} not found` })
      Object.assign(e, { taskId: body.taskId, comment: body.comment, start: body.start, end: body.end, updatedAt: now })
      return send(200, e)
    }
  }
  send(404, { error: 'Not found' })
})

server.listen(PORT, () => console.log(`Mock Memtime API on http://localhost:${PORT}/api/v1 (limit ${LIMIT}/60s)`))
