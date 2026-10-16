/**
 * Lemon Squeezy license + webhook integration.
 * - Webhook: X-Signature = HMAC-SHA256(hex) of the raw body with the signing secret.
 * - License API: POST https://api.lemonsqueezy.com/v1/licenses/{activate|validate|deactivate} (form-encoded, no auth).
 * Source: docs.lemonsqueezy.com (consulted 2026-10-10).
 */

const enc = new TextEncoder()

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function verifyLemonSignature(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false
  return timingSafeEqual(await hmacHex(secret, rawBody), header.toLowerCase())
}

export interface LemonEvent {
  meta: { event_name: string; webhook_id?: string; custom_data?: Record<string, string> }
  data: { id: string; attributes: Record<string, unknown> }
}

/** Events we act on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = new Set(["order_created", "order_refunded", "license_key_created", "license_key_updated", "subscription_expired", "subscription_cancelled"])

/**
 * Idempotent webhook processing: the event id (webhook_id or data.id+event) is stored in KV before
 * side effects. Returns "duplicate" when already processed.
 */
export async function handleLemonWebhook(
  rawBody: string,
  signature: string | null,
  env: { LEMON_WEBHOOK_SECRET: string; LICENSES: KVNamespace },
): Promise<{ status: number; result: string }> {
  if (!(await verifyLemonSignature(env.LEMON_WEBHOOK_SECRET, rawBody, signature))) return { status: 401, result: "bad_signature" }
  let event: LemonEvent
  try {
    event = JSON.parse(rawBody) as LemonEvent
  } catch {
    return { status: 400, result: "bad_json" }
  }
  const name = event.meta?.event_name
  if (!name || !HANDLED_EVENTS.has(name)) return { status: 200, result: "ignored" }
  const key = `evt:${event.meta.webhook_id ?? `${name}:${event.data.id}`}`
  if (await env.LICENSES.get(key)) return { status: 200, result: "duplicate" }
  await env.LICENSES.put(key, "1", { expirationTtl: 60 * 60 * 24 * 30 })

  // Revocation state keyed by license key id; the plugin validates against this + the LS API.
  if (name === "order_refunded" || name === "subscription_expired" || name === "subscription_cancelled") {
    const licenseKeyId = String(event.data.attributes.license_key_id ?? event.data.id)
    await env.LICENSES.put(`revoked:${licenseKeyId}`, name)
  }
  return { status: 200, result: name }
}

export interface LicenseClient {
  (path: "activate" | "validate" | "deactivate", form: Record<string, string>): Promise<Response>
}

export const lemonLicenseClient: LicenseClient = (path, form) =>
  fetch(`https://api.lemonsqueezy.com/v1/licenses/${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  })
