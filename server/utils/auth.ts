// Process-wide wiring of the auth store and the session cookie, like memtime.ts is for the
// upstream client. Routes and middleware use these; the pure logic lives in auth-store.ts.
import type { H3Event } from 'h3'
import { createAuthStore, SESSION_ABSOLUTE_MS, type AuthStore } from './auth-store'
import { useOAuthConfig, useSessionSecret } from './auth-config'
import { createTokenCipher } from './token-cipher'

export const SESSION_COOKIE = 'mt_session'

let store: AuthStore | undefined

export function useAuthStore(): AuthStore {
  store ??= createAuthStore({
    storage: useStorage('auth'),
    cipher: createTokenCipher(useSessionSecret()),
  })
  return store
}

/** Secure cookies need https; a plain-http redirect URI is only allowed for localhost. */
function secureCookies() {
  return useOAuthConfig()?.redirectUri.startsWith('https://') ?? !import.meta.dev
}

export function readSessionId(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE)
}

export function setSessionCookie(event: H3Event, id: string) {
  setCookie(event, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: secureCookies(),
    // Lax, not Strict: the redirect back from the authorization server is a cross-site navigation.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/' })
}
