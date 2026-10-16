import { CaptureRequest } from "@sitepromo/contracts"
import { captureSite } from "./capture.js"
import { handleLemonWebhook, lemonLicenseClient } from "./license.js"
import { preflight } from "./preflight.js"
import { signToken, verifyToken } from "./token.js"
import { GuardError } from "./url-guard.js"

export interface Env {
  BROWSER: Fetcher
  SESSION_SECRET: string
  /** "0" = kill switch for capture */
  CAPTURE_ENABLED?: string
  /** Rate limiting binding (per client IP) */
  CAPTURE_RL?: { limit(opts: { key: string }): Promise<{ success: boolean }> }
  /** Daily global quota counter (KV). Optional until bound. */
  QUOTA?: KVNamespace
  DAILY_BROWSER_BUDGET_MS?: string
  ALLOWED_ORIGIN?: string
  /** Lemon Squeezy (prepared; unset until the owner creates the store) */
  LEMON_WEBHOOK_SECRET?: string
  LICENSES?: KVNamespace
}

const SESSION_TTL_S = 60 * 60
const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } })

function cors(env: Env, req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? ""
  const allowed = env.ALLOWED_ORIGIN ?? ""
  return allowed && origin === allowed
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" }
    : {}
}

export default {
  async fetch(req, env): Promise<Response> {
    const h = cors(env, req)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h })
    const { pathname } = new URL(req.url)

    if (req.method === "POST" && pathname === "/session") {
      // ponytail: no Turnstile yet; token is a cheap handle for rate limiting and a future tier claim.
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown"
      if (env.CAPTURE_RL && !(await env.CAPTURE_RL.limit({ key: `session:${ip}` })).success) return json({ error: "rate_limited" }, 429, { ...h, "retry-after": "60" })
      const sid = crypto.randomUUID()
      const token = await signToken({ sid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S, tier: "free" }, env.SESSION_SECRET)
      return json({ token, expiresIn: SESSION_TTL_S }, 200, h)
    }

    if (req.method === "POST" && pathname === "/capture") {
      if (env.CAPTURE_ENABLED === "0") return json({ error: "capture_disabled" }, 503, h)
      const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
      const claims = await verifyToken(auth, env.SESSION_SECRET)
      if (!claims) return json({ error: "unauthorized" }, 401, h)

      const ip = req.headers.get("cf-connecting-ip") ?? "unknown"
      if (env.CAPTURE_RL) {
        const [perIp, perSession] = await Promise.all([env.CAPTURE_RL.limit({ key: `ip:${ip}` }), env.CAPTURE_RL.limit({ key: `sid:${claims.sid}` })])
        if (!perIp.success || !perSession.success) return json({ error: "rate_limited" }, 429, { ...h, "retry-after": "60" })
      }
      if (env.QUOTA) {
        const day = new Date().toISOString().slice(0, 10)
        const used = Number((await env.QUOTA.get(`browser-ms:${day}`)) ?? 0)
        if (used >= Number(env.DAILY_BROWSER_BUDGET_MS ?? 8 * 60_000)) return json({ error: "quota_exhausted" }, 429, h)
      }

      const parsed = CaptureRequest.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: "bad_request", issues: parsed.error.issues }, 400, h)

      const started = Date.now()
      let browserStarted: number | null = null
      try {
        const { target } = await preflight(parsed.data.url, { fetch })
        browserStarted = Date.now()
        const results = await captureSite(env.BROWSER, target.href, parsed.data.viewports)
        const browserMs = Date.now() - started
        console.log(JSON.stringify({ evt: "capture_ok", host: target.hostname, browserMs, viewports: parsed.data.viewports.length }))
        return json({ url: target.href, results, browserMs }, 200, h)
      } catch (e) {
        if (e instanceof GuardError) {
          console.log(JSON.stringify({ evt: "capture_rejected", reason: e.reason }))
          return json({ error: "url_rejected", reason: e.reason }, 422, h)
        }
        console.log(JSON.stringify({ evt: "capture_failed", message: (e as Error).message?.slice(0, 200) }))
        return json({ error: "capture_failed" }, 502, h)
      } finally {
        // Charge browser time on success AND failure (timeouts burn minutes too).
        // ponytail: KV read-modify-write is a soft cap; concurrent bursts can overshoot slightly.
        if (env.QUOTA && browserStarted !== null) {
          const day = new Date().toISOString().slice(0, 10)
          const used = Number((await env.QUOTA.get(`browser-ms:${day}`)) ?? 0)
          await env.QUOTA.put(`browser-ms:${day}`, String(used + (Date.now() - browserStarted)), { expirationTtl: 172_800 })
        }
      }
    }

    // Payments: prepared, inactive until secrets/KV exist.
    if (req.method === "POST" && pathname === "/webhooks/lemonsqueezy") {
      if (!env.LEMON_WEBHOOK_SECRET || !env.LICENSES) return json({ error: "payments_not_configured" }, 503)
      const r = await handleLemonWebhook(await req.text(), req.headers.get("x-signature"), { LEMON_WEBHOOK_SECRET: env.LEMON_WEBHOOK_SECRET, LICENSES: env.LICENSES })
      return json({ result: r.result }, r.status)
    }
    if (req.method === "POST" && /^\/license\/(activate|validate|deactivate)$/.test(pathname)) {
      if (!env.LICENSES) return json({ error: "payments_not_configured" }, 503, h)
      const body = (await req.json().catch(() => null)) as { license_key?: string; instance_id?: string; instance_name?: string } | null
      if (!body?.license_key || typeof body.license_key !== "string" || body.license_key.length > 64) return json({ error: "bad_request" }, 400, h)
      const action = pathname.split("/")[2] as "activate" | "validate" | "deactivate"
      const upstream = await lemonLicenseClient(action, { license_key: body.license_key, ...(body.instance_id ? { instance_id: body.instance_id } : {}), ...(body.instance_name ? { instance_name: body.instance_name } : {}) })
      const data = (await upstream.json().catch(() => ({}))) as { valid?: boolean; license_key?: { id?: number } }
      const revoked = data.license_key?.id ? await env.LICENSES.get(`revoked:${data.license_key.id}`) : null
      return json({ valid: Boolean(data.valid) && !revoked, revoked: Boolean(revoked), upstream: data }, upstream.ok ? 200 : 400, h)
    }

    return json({ error: "not_found" }, 404, h)
  },
} satisfies ExportedHandler<Env>
