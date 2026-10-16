import { describe, expect, it } from "vitest"
import { signToken, verifyToken } from "./token.js"

describe("session token", () => {
  const secret = "test-secret"
  it("round-trips and rejects tampering/expiry/wrong secret", async () => {
    const t = await signToken({ sid: "abc", exp: 2_000_000_000, tier: "free" }, secret)
    expect(await verifyToken(t, secret)).toMatchObject({ sid: "abc", tier: "free" })
    expect(await verifyToken(t, "other")).toBeNull()
    expect(await verifyToken(`${t}x`, secret)).toBeNull()
    const [p, s] = t.split(".")
    expect(await verifyToken(`${p}a.${s}`, secret)).toBeNull()
    const expired = await signToken({ sid: "abc", exp: 1, tier: "free" }, secret)
    expect(await verifyToken(expired, secret)).toBeNull()
    expect(await verifyToken("garbage", secret)).toBeNull()
  })
})
