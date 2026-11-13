// Random share ids, delete tokens and SHA-256 digests (Web Crypto: Workers runtime and Node alike).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
/** Largest multiple of 62 below 256: bytes from here on are skipped so every letter is equally likely. */
const UNBIASED_LIMIT = 248

export class ShareCrypto {
  /** A 10-character [A-Za-z0-9] share id (SHARE_ID_PATTERN). */
  static newId(): string {
    let id = ''
    while (id.length < 10) {
      for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
        if (byte >= UNBIASED_LIMIT || id.length === 10) continue
        id += ALPHABET[byte % ALPHABET.length]
      }
    }
    return id
  }

  /** 32 random bytes, base64url: the creator's delete token. */
  static newToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  static async sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}
