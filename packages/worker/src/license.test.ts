import { describe, expect, it } from "vitest"
import { handleLemonWebhook, hmacHex, verifyLemonSignature } from "./license.js"

const kv = () => {
  const m = new Map<string, string>()
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v) }, map: m } as unknown as KVNamespace & { map: Map<string, string> }
}
const secret = "whsec"
const body = (name: string, id = "1", attrs: Record<string, unknown> = {}) => JSON.stringify({ meta: { event_name: name, webhook_id: `w-${name}-${id}` }, data: { id, attributes: attrs } })

describe("lemon webhook", () => {
  it("verifies HMAC and rejects tampering", async () => {
    const b = body("order_created")
    const sig = await hmacHex(secret, b)
    expect(await verifyLemonSignature(secret, b, sig)).toBe(true)
    expect(await verifyLemonSignature(secret, `${b} `, sig)).toBe(false)
    expect(await verifyLemonSignature("other", b, sig)).toBe(false)
    expect(await verifyLemonSignature(secret, b, null)).toBe(false)
  })
  it("is idempotent and records revocations", async () => {
    const env = { LEMON_WEBHOOK_SECRET: secret, LICENSES: kv() }
    const b = body("order_refunded", "o1", { license_key_id: 42 })
    const sig = await hmacHex(secret, b)
    expect(await handleLemonWebhook(b, sig, env)).toEqual({ status: 200, result: "order_refunded" })
    expect(await handleLemonWebhook(b, sig, env)).toEqual({ status: 200, result: "duplicate" })
    expect(env.LICENSES.map.get("revoked:42")).toBe("order_refunded")
  })
  it("rejects bad signature before touching storage; ignores unknown events", async () => {
    const env = { LEMON_WEBHOOK_SECRET: secret, LICENSES: kv() }
    expect((await handleLemonWebhook(body("order_created"), "deadbeef", env)).status).toBe(401)
    expect(env.LICENSES.map.size).toBe(0)
    const b = body("affiliate_activated")
    expect(await handleLemonWebhook(b, await hmacHex(secret, b), env)).toEqual({ status: 200, result: "ignored" })
  })
})
