// Encrypts OAuth tokens before they go into session storage, so a copy of .data/ or a Redis dump
// doesn't hand out working tokens. Pure (no Nitro globals) so it can be unit-tested.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export interface TokenCipher {
  encrypt(plain: string): string
  /** null when the value was tampered with, or was written with another secret. */
  decrypt(sealed: string): string | null
}

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

export function createTokenCipher(secret: string): TokenCipher {
  if (!secret) throw new Error('createTokenCipher needs a secret.')
  // A dedicated key per purpose, so the same secret can sign cookies without reusing this key.
  const key = Buffer.from(hkdfSync('sha256', secret, 'memtime-tracker', 'session-token-encryption', 32))

  return {
    encrypt(plain) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.')
    },
    decrypt(sealed) {
      const [version, iv, tag, body] = sealed.split('.')
      if (version !== VERSION || !iv || !tag || body === undefined) return null
      try {
        const ivBuf = Buffer.from(iv, 'base64url')
        const tagBuf = Buffer.from(tag, 'base64url')
        if (ivBuf.length !== IV_BYTES || tagBuf.length !== TAG_BYTES) return null
        const decipher = createDecipheriv('aes-256-gcm', key, ivBuf)
        decipher.setAuthTag(tagBuf)
        return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
      }
      catch {
        return null
      }
    },
  }
}
