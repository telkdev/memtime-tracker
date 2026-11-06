// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { oauthConfigProblems, type RawAuthConfig } from '../../server/utils/auth-config'

const valid: RawAuthConfig = {
  clientId: 'client-1',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/authentication/callback',
  authBaseUrl: 'https://auth.test/auth',
  authScope: 'time_tracking',
  sessionSecret: 's'.repeat(32),
}

describe('OAuth config', () => {
  it('accepts a complete config', () => {
    expect(oauthConfigProblems(valid, false)).toEqual([])
  })

  it('treats login as off when there is no client id', () => {
    expect(oauthConfigProblems({ ...valid, clientId: '', clientSecret: '', sessionSecret: '' }, false)).toEqual([])
  })

  it('lists every missing setting at once', () => {
    const problems = oauthConfigProblems({ ...valid, clientSecret: '', authScope: '', sessionSecret: 'short' }, false)
    expect(problems).toHaveLength(3)
    expect(problems.join()).toMatch(/NUXT_CLIENT_SECRET.*NUXT_AUTH_SCOPE.*NUXT_SESSION_SECRET/s)
  })

  it('refuses plain http outside localhost in production', () => {
    const problems = oauthConfigProblems({ ...valid, redirectUri: 'http://tracker.example.com/authentication/callback', authBaseUrl: 'http://auth.test/auth' }, false)
    expect(problems.join()).toMatch(/NUXT_AUTH_BASE_URL.*NUXT_REDIRECT_URI/s)
  })

  it('refuses URLs with credentials or that are not URLs', () => {
    expect(oauthConfigProblems({ ...valid, authBaseUrl: 'https://user:pass@auth.test/auth' }, false)).toHaveLength(1)
    expect(oauthConfigProblems({ ...valid, redirectUri: 'not a url' }, false)).toHaveLength(1)
  })
})
