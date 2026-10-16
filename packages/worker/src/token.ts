/** Short-lived HMAC session tokens: base64url(payload).base64url(sig). No DB. */

const enc = new TextEncoder()

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

export interface SessionClaims {
  /** subject: opaque session id */
  sid: string
  /** expiry, unix seconds */
  exp: number
  /** tier, free by default */
  tier: "free" | "pro"
}

export async function signToken(claims: SessionClaims, secret: string): Promise<string> {
  const payload = b64u(enc.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload))
  return `${payload}.${b64u(sig)}`
}

export async function verifyToken(token: string, secret: string, now = Date.now() / 1000): Promise<SessionClaims | null> {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const ok = await crypto.subtle.verify("HMAC", await key(secret), unb64u(sig), enc.encode(payload)).catch(() => false)
  if (!ok) return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64u(payload))) as SessionClaims
    if (typeof claims.exp !== "number" || claims.exp < now) return null
    return claims
  } catch {
    return null
  }
}
