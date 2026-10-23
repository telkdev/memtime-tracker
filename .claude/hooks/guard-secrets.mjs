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

// The real key, if this machine has one. The hook may read .env even though Claude may not.
const envFile = join(root, '.env')
const realKey = existsSync(envFile)
  ? readFileSync(envFile, 'utf8').match(/^NUXT_MEMTIME_API_KEY=(.+)$/m)?.[1]?.trim() ?? ''
  : ''
if (realKey.length >= 8 && text.includes(realKey))
  problems.push('the real API key from .env appears in this write')

if (rel === '.env.example' && /^NUXT_MEMTIME_API_KEY=\S/m.test(text))
  problems.push('.env.example must keep NUXT_MEMTIME_API_KEY empty')

// A literal bearer token or key-like assignment (24+ chars of base62) anywhere outside .env.
if (/Bearer\s+[A-Za-z0-9_-]{24,}/.test(text))
  problems.push('literal "Bearer <token>" found; read the key from runtimeConfig instead')
if (/(api[_-]?key|memtimeApiKey)\s*[:=]\s*['"`][A-Za-z0-9_-]{24,}['"`]/i.test(text))
  problems.push('hard-coded API key value found')

// Client code must never touch the key, even by name.
if (rel.startsWith('app/') && /memtimeApiKey|MEMTIME_API_KEY/.test(text))
  problems.push('client code (app/) references the API key; only server/utils/memtime.ts may')

// The key must not be exposed through public runtime config.
if (/nuxt\.config\.[cm]?ts$/.test(rel) && /public\s*:\s*\{[^}]*apiKey/is.test(text))
  problems.push('API key placed under runtimeConfig.public; keep it private')

if (problems.length) {
  console.error(`Blocked write to ${rel}:\n- ${problems.join('\n- ')}`)
  process.exit(2)
}
