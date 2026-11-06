// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { createStorage, type Storage } from 'unstorage'
import { createAuthStore, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../../server/utils/auth-store'
import { createTokenCipher } from '../../server/utils/token-cipher'

const tokens = { accessToken: 'access-token-value', refreshToken: 'refresh-token-value', expiresAt: 1_000 }

let storage: Storage
let clock: number

function makeStore() {
  return createAuthStore({ storage, cipher: createTokenCipher('test-secret-0123456789abcdefghijklmnop'), now: () => clock })
}

beforeEach(() => {
  storage = createStorage()
  clock = Date.parse('2026-11-06T12:00:00Z')
})

describe('users', () => {
  it('creates a user on first login and keeps createdAt after that', async () => {
    const store = makeStore()
    const first = await store.upsertUser({ id: 'sub-1', name: 'Ada' })
    clock += 60_000
    const second = await store.upsertUser({ id: 'sub-1', email: 'ada@example.com' })

    expect(second.createdAt).toBe(first.createdAt)
    expect(second.lastLoginAt).not.toBe(first.lastLoginAt)
    expect(second).toMatchObject({ name: 'Ada', email: 'ada@example.com' })
    expect(await store.getUser('sub-1')).toEqual(second)
  })

  it('stores subjects with separators safely', async () => {
    const store = makeStore()
    await store.upsertUser({ id: 'auth0|abc:def/ghi' })
    expect((await store.getUser('auth0|abc:def/ghi'))?.id).toBe('auth0|abc:def/ghi')
    expect(await store.getUser('auth0|abc')).toBeNull()
  })
})

describe('sessions', () => {
  it('returns the session and tokens for its id', async () => {
    const store = makeStore()
    const { id } = await store.createSession('sub-1', tokens)
    expect(await store.getSession(id)).toMatchObject({ userId: 'sub-1', tokens })
  })

  it('gives every login a new random id', async () => {
    const store = makeStore()
    const a = await store.createSession('sub-1', tokens)
    const b = await store.createSession('sub-1', tokens)
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^[\w-]{43}$/)
  })

  it('keeps neither the raw id nor plain tokens in storage', async () => {
    const store = makeStore()
    const { id } = await store.createSession('sub-1', tokens)
    const keys = await storage.getKeys()
    const dump = JSON.stringify(await Promise.all(keys.map(k => storage.getItem(k))))

    expect(keys.join()).not.toContain(id)
    expect(dump).not.toContain('access-token-value')
    expect(dump).not.toContain('refresh-token-value')
  })

  it('ignores ids that are missing, malformed or unknown', async () => {
    const store = makeStore()
    expect(await store.getSession(undefined)).toBeNull()
    expect(await store.getSession('../users:x')).toBeNull()
    expect(await store.getSession('a'.repeat(43))).toBeNull()
  })

  it('ends a session after the idle timeout', async () => {
    const store = makeStore()
    const { id } = await store.createSession('sub-1', tokens)
    clock += SESSION_IDLE_MS
    expect(await store.getSession(id)).toBeNull()
    expect(await storage.getKeys('sessions')).toHaveLength(0)
  })

  it('stays alive while used, but not past the absolute lifetime', async () => {
    const store = makeStore()
    const { id } = await store.createSession('sub-1', tokens)
    const step = SESSION_IDLE_MS / 2
    for (let t = step; t < SESSION_ABSOLUTE_MS; t += step) {
      clock += step
      expect(await store.getSession(id)).not.toBeNull()
    }
    clock += step
    expect(await store.getSession(id)).toBeNull()
  })

  it('updates tokens without extending the session lifetime', async () => {
    const store = makeStore()
    const { id, session } = await store.createSession('sub-1', tokens)
    clock += 1_000
    await store.updateTokens(id, { accessToken: 'new-access' })
    const after = await store.getSession(id)
    expect(after?.tokens.accessToken).toBe('new-access')
    expect(after?.createdAt).toBe(session.createdAt)
  })

  it('drops a session whose tokens no longer decrypt (secret rotated)', async () => {
    const { id } = await makeStore().createSession('sub-1', tokens)
    const rotated = createAuthStore({ storage, cipher: createTokenCipher('another-secret-0123456789abcdefghijk'), now: () => clock })
    expect(await rotated.getSession(id)).toBeNull()
    expect(await storage.getKeys('sessions')).toHaveLength(0)
  })

  it('deletes a session on logout', async () => {
    const store = makeStore()
    const { id } = await store.createSession('sub-1', tokens)
    await store.deleteSession(id)
    expect(await store.getSession(id)).toBeNull()
  })
})
