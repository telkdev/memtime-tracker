#!/usr/bin/env node
// PreToolUse guard for Edit/Write/MultiEdit: blocks writes that would leak the API key.
// Exit 2 blocks the tool call and feeds stderr back to Claude.
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const tool = input.tool_input ?? {}
const filePath = tool.file_path ?? ''
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const rel = relative(root, filePath)

// .env is gitignored and is where the key belongs.
if (/^\.env(\.local)?$/.test(rel)) process.exit(0)

const text = [tool.content, tool.new_string, ...(tool.edits ?? []).map(e => e.new_string)]
  .filter(Boolean)
  .join('\n')

const problems = []

// The real secrets, if this machine has them. The hook may read .env even though Claude may not.
const SECRET_VARS = ['NUXT_MEMTIME_API_KEY', 'NUXT_CLIENT_SECRET', 'NUXT_SESSION_SECRET']
const envFile = join(root, '.env')
const envText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
for (const name of SECRET_VARS) {
  const value = envText.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
  if (value.length >= 8 && text.includes(value))
    problems.push(`the real ${name} from .env appears in this write`)
  if (rel === '.env.example' && new RegExp(`^${name}=\\S`, 'm').test(text))
    problems.push(`.env.example must keep ${name} empty`)
}

// A literal bearer token or key-like assignment (24+ chars of base62) anywhere outside .env.
if (/Bearer\s+[A-Za-z0-9_-]{24,}/.test(text))
  problems.push('literal "Bearer <token>" found; read the key from runtimeConfig instead')
if (/(api[_-]?key|memtimeApiKey)\s*[:=]\s*['"`][A-Za-z0-9_-]{24,}['"`]/i.test(text))
  problems.push('hard-coded API key value found')

// Client code must never touch the key or the auth secrets, even by name.
if (rel.startsWith('app/') && /memtimeApiKey|MEMTIME_API_KEY/.test(text))
  problems.push('client code (app/) references the API key; only server/utils/memtime.ts may')
if (rel.startsWith('app/') && /clientSecret|sessionSecret|CLIENT_SECRET|SESSION_SECRET/.test(text))
  problems.push('client code (app/) references an auth secret; only server/utils/auth-config.ts may')

// The key must not be exposed through public runtime config.
if (/nuxt\.config\.[cm]?ts$/.test(rel) && /public\s*:\s*\{[^}]*(apiKey|clientSecret|sessionSecret)/is.test(text))
  problems.push('a secret placed under runtimeConfig.public; keep it private')

if (problems.length) {
  console.error(`Blocked write to ${rel}:\n- ${problems.join('\n- ')}`)
  process.exit(2)
}
