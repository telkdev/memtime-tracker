// Users and login sessions, kept in Nitro storage (fs in dev, Redis/Upstash when there is more
// than one instance). Memtime owns the data, so a user record is only the identity the
// authorization server gave us; a session holds that user's tokens. Pure factory: tests pass a
// memory storage and a fixed clock.
import { createHash, randomBytes } from 'node:crypto'
import type { Storage } from 'unstorage'
import { z } from 'zod'
import type { TokenCipher } from './token-cipher'

export interface AuthUser {
  /** Our id for the user: the authorization server's stable subject, as given. */
  id: string
  name?: string
  email?: string
  createdAt: string
  lastLoginAt: string
}

export interface SessionTokens {
  accessToken: string
  refreshToken?: string
  /** Epoch ms when the access token expires, if the token response said. */
  expiresAt?: number
}

export interface AuthSession {
  userId: string
  tokens: SessionTokens
  createdAt: number
  lastSeenAt: number
}

export interface AuthStoreOptions {
  storage: Storage
  cipher: TokenCipher
  now?: () => number
  /** A session ends this long after login, however active it is. */
  absoluteMs?: number
  /** A session ends after this long without a request. */
  idleMs?: number
}

export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60_000
export const SESSION_IDLE_MS = 12 * 60 * 60_000
/** lastSeenAt is written at most this often, so reads don't turn into a write per request. */
const TOUCH_EVERY_MS = 60_000

/** 32 random bytes, base64url: the only form a session id cookie can take. */
const SESSION_ID = /^[\w-]{43}$/

const userSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  createdAt: z.string(),
  lastLoginAt: z.string(),
})

const storedSessionSchema = z.object({
  userId: z.string().min(1),
  tokens: z.string(),
  createdAt: z.number(),
  lastSeenAt: z.number(),
})

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
})

// Storage keys never contain the raw id, so a leaked storage dump can't be replayed as cookies.
function sessionKey(id: string) {
  return `sessions:${createHash('sha256').update(id).digest('hex')}`
}

// Hashed too: a subject may contain ':' or '/', which unstorage treats as key separators.
function userKey(id: string) {
  return `users:${createHash('sha256').update(id).digest('hex')}`
}

export function createAuthStore(opts: AuthStoreOptions) {
  const { storage, cipher } = opts
  const now = opts.now ?? Date.now
  const absoluteMs = opts.absoluteMs ?? SESSION_ABSOLUTE_MS
  const idleMs = opts.idleMs ?? SESSION_IDLE_MS

  async function getUser(id: string): Promise<AuthUser | null> {
    const parsed = userSchema.safeParse(await storage.getItem(userKey(id)))
    return parsed.success ? parsed.data : null
  }

  /** Creates the user on first login, refreshes name/email and lastLoginAt after that. */
  async function upsertUser(identity: { id: string, name?: string, email?: string }): Promise<AuthUser> {
    const at = new Date(now()).toISOString()
    const existing = await getUser(identity.id)
    const user: AuthUser = {
      id: identity.id,
      name: identity.name ?? existing?.name,
      email: identity.email ?? existing?.email,
      createdAt: existing?.createdAt ?? at,
      lastLoginAt: at,
    }
    await storage.setItem(userKey(user.id), user)
    return user
  }

  function seal(tokens: SessionTokens) {
    return cipher.encrypt(JSON.stringify(tokens))
  }

  /** A fresh id on every login, so an id planted before login (session fixation) is useless. */
  async function createSession(userId: string, tokens: SessionTokens): Promise<{ id: string, session: AuthSession }> {
    const id = randomBytes(32).toString('base64url')
    const at = now()
    const session: AuthSession = { userId, tokens, createdAt: at, lastSeenAt: at }
    await storage.setItem(sessionKey(id), { userId, tokens: seal(tokens), createdAt: at, lastSeenAt: at })
    return { id, session }
  }

  /** The live session for a cookie value, or null. Expired or unreadable sessions are deleted. */
  async function getSession(id: string | undefined): Promise<AuthSession | null> {
    if (!id || !SESSION_ID.test(id)) return null
    const key = sessionKey(id)
    const stored = storedSessionSchema.safeParse(await storage.getItem(key))
    if (!stored.success) return null

    const at = now()
    const { userId, createdAt, lastSeenAt } = stored.data
    const expired = at - createdAt >= absoluteMs || at - lastSeenAt >= idleMs
    const opened = cipher.decrypt(stored.data.tokens)
    const tokens = opened === null ? null : tokensSchema.safeParse(safeJson(opened))
    if (expired || !tokens?.success) {
      await storage.removeItem(key)
      return null
    }

    if (at - lastSeenAt >= TOUCH_EVERY_MS) {
      await storage.setItem(key, { ...stored.data, lastSeenAt: at })
    }
    return { userId, tokens: tokens.data, createdAt, lastSeenAt: at }
  }

  /** After a token refresh. Keeps the session's age, so refreshing never extends its lifetime. */
  async function updateTokens(id: string, tokens: SessionTokens): Promise<void> {
    if (!SESSION_ID.test(id)) return
    const key = sessionKey(id)
    const stored = storedSessionSchema.safeParse(await storage.getItem(key))
    if (!stored.success) return
    await storage.setItem(key, { ...stored.data, tokens: seal(tokens), lastSeenAt: now() })
  }

  async function deleteSession(id: string | undefined): Promise<void> {
    if (id && SESSION_ID.test(id)) await storage.removeItem(sessionKey(id))
  }

  return { getUser, upsertUser, createSession, getSession, updateTokens, deleteSession }
}

export type AuthStore = ReturnType<typeof createAuthStore>

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}
