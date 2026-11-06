// OAuth client settings and the session secret. The only file that reads them, the same way
// memtime.ts is the only reader of the API key (ESLint enforces both).

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Base URL of Memtime's authorization server, e.g. https://…/auth. */
  authBaseUrl: string
  scope: string
}

export interface RawAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authBaseUrl: string
  authScope: string
  sessionSecret: string
}

export const MIN_SESSION_SECRET_LENGTH = 32

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/

function isAllowedUrl(value: string, dev: boolean) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    return url.protocol === 'https:' || LOCAL_HTTP.test(value) || (dev && url.protocol === 'http:')
  }
  catch {
    return false
  }
}

/**
 * Problems with the OAuth settings, as messages a person can act on. Login is switched on by
 * NUXT_CLIENT_ID alone: with no client id the app keeps running on the API key (mock API, smoke).
 */
export function oauthConfigProblems(raw: RawAuthConfig, dev: boolean): string[] {
  if (!raw.clientId) return []
  const problems: string[] = []
  if (!raw.clientSecret) problems.push('NUXT_CLIENT_SECRET is not set.')
  if (!raw.authScope) problems.push('NUXT_AUTH_SCOPE is not set.')
  if (!isAllowedUrl(raw.authBaseUrl, dev)) {
    problems.push('NUXT_AUTH_BASE_URL must be an https URL (plain http only for localhost).')
  }
  if (!isAllowedUrl(raw.redirectUri, dev)) {
    problems.push('NUXT_REDIRECT_URI must be an https URL (plain http only for localhost).')
  }
  if (raw.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`NUXT_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`)
  }
  return problems
}

function rawConfig(): RawAuthConfig {
  const c = useRuntimeConfig()
  return {
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    redirectUri: c.redirectUri,
    authBaseUrl: c.authBaseUrl,
    authScope: c.authScope,
    sessionSecret: c.sessionSecret,
  }
}

/** Throws at startup with every problem listed, instead of failing on the first login. */
export function assertOAuthConfig() {
  const problems = oauthConfigProblems(rawConfig(), import.meta.dev)
  if (problems.length) throw new Error(`OAuth login is misconfigured:\n  - ${problems.join('\n  - ')}`)
}

/** The OAuth client settings, or null when login is off (no NUXT_CLIENT_ID). */
export function useOAuthConfig(): OAuthConfig | null {
  const raw = rawConfig()
  if (!raw.clientId) return null
  return {
    clientId: raw.clientId,
    clientSecret: raw.clientSecret,
    redirectUri: raw.redirectUri,
    authBaseUrl: raw.authBaseUrl.replace(/\/$/, ''),
    scope: raw.authScope,
  }
}

export function useSessionSecret(): string {
  return rawConfig().sessionSecret
}
