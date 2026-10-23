#!/usr/bin/env node
// PostToolUse: run eslint --fix on the edited file. Exit 2 feeds remaining errors back to Claude.
// No-op until the project is scaffolded (no local eslint yet).
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const file = input.tool_input?.file_path ?? ''
const eslint = join(root, 'node_modules', '.bin', 'eslint')

if (!/\.(ts|vue|mjs|js)$/.test(file) || !existsSync(eslint) || !existsSync(file)) process.exit(0)

const res = spawnSync(eslint, ['--fix', '--no-warn-ignored', file], { cwd: root, encoding: 'utf8' })
if (res.status !== 0) {
  console.error(`eslint found problems in ${file}:\n${(res.stdout + res.stderr).slice(-3000)}`)
  process.exit(2)
}
