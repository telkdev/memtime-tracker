// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTokenCipher } from '../../server/utils/token-cipher'

const SECRET = 'test-secret-0123456789abcdefghijklmnop'

describe('token cipher', () => {
  it('round-trips a value', () => {
    const cipher = createTokenCipher(SECRET)
    expect(cipher.decrypt(cipher.encrypt('access-token-value'))).toBe('access-token-value')
  })

  it('never stores the plain value', () => {
    const sealed = createTokenCipher(SECRET).encrypt('access-token-value')
    expect(sealed).not.toContain('access-token-value')
    expect(sealed.startsWith('v1.')).toBe(true)
  })

  it('uses a fresh IV each time', () => {
    const cipher = createTokenCipher(SECRET)
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'))
  })

  it('rejects a tampered value', () => {
    const cipher = createTokenCipher(SECRET)
    const parts = cipher.encrypt('access-token-value').split('.')
    parts[3] = Buffer.from('forged').toString('base64url')
    expect(cipher.decrypt(parts.join('.'))).toBeNull()
  })

  it('rejects a value sealed with another secret', () => {
    const sealed = createTokenCipher(SECRET).encrypt('access-token-value')
    expect(createTokenCipher(`${SECRET}-rotated`).decrypt(sealed)).toBeNull()
  })

  it('rejects junk', () => {
    const cipher = createTokenCipher(SECRET)
    for (const junk of ['', 'v1', 'v1.a.b', 'v2.a.b.c', 'not base64 at all']) {
      expect(cipher.decrypt(junk)).toBeNull()
    }
  })
})
