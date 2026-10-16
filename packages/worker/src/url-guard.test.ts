import { describe, expect, it } from "vitest"
import { assertPublicHost, createRequestFilter, GuardError, isPrivateIp, looksLikeFramerHtml, parseTargetUrl } from "./url-guard.js"

const reason = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as GuardError).reason
  }
  return "ok"
}

describe("parseTargetUrl structural checks", () => {
  it.each([
    ["http://example.framer.website/", "scheme"],
    ["ftp://example.framer.website/", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["https://user:pw@example.framer.website/", "credentials"],
    ["https://user@example.framer.website/", "credentials"],
    ["https://example.framer.website:8443/", "port"],
    ["https://example.framer.website:80/", "port"],
    ["https://127.0.0.1/", "ip_literal"],
    ["https://10.0.0.1/", "ip_literal"],
    ["https://169.254.169.254/latest/meta-data/", "ip_literal"],
    ["https://[::1]/", "ip_literal"],
    ["https://[fd00::1]/", "ip_literal"],
    ["https://2130706433/", "ip_literal"],
    ["https://0x7f000001/", "ip_literal"],
    ["https://localhost/", "host_forbidden"],
    ["https://foo.localhost/", "host_forbidden"],
    ["https://metadata.internal/", "host_forbidden"],
    ["https://printer.local/", "host_forbidden"],
    ["https://router.lan/", "host_forbidden"],
    ["https://x.onion/", "host_forbidden"],
    ["https://nodots/", "host_syntax"],
    ["not a url", "host_syntax"],
    ["https://a..b.com/", "host_syntax"],
    [`https://${"a".repeat(2100)}.com/`, "too_long"],
  ])("rejects %s (%s)", (url, expected) => {
    expect(reason(() => parseTargetUrl(url))).toBe(expected)
  })

  it("accepts framer-managed hosts and strips hash", () => {
    const t = parseTargetUrl("https://Demo.Framer.Website/about#x")
    expect(t.hostname).toBe("demo.framer.website")
    expect(t.framerManaged).toBe(true)
    expect(t.href).toBe("https://demo.framer.website/about")
  })

  it("accepts custom domains but flags them as not managed", () => {
    expect(parseTargetUrl("https://studio.example.com/").framerManaged).toBe(false)
  })

  it("accepts explicit :443", () => {
    expect(parseTargetUrl("https://demo.framer.app:443/").hostname).toBe("demo.framer.app")
  })
})

describe("isPrivateIp", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "192.0.0.1", "100.64.0.1", "100.127.255.255", "198.18.0.1", "224.0.0.1", "240.0.0.1",
    "255.255.255.255", "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::",
    "::7f00:1", "::127.0.0.1", "2001:0:4136:e378::1", "64:ff9b:1::1",
    "999.1.1.1", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each(["1.1.1.1", "8.8.8.8", "104.18.0.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "2606:4700::6810:84e5", "2a00:1450:4001::1"])(
    "allows public %s",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false)
    },
  )
})

describe("assertPublicHost with resolver", () => {
  it("rejects when any answer is private (rebinding / split answers)", async () => {
    await expect(assertPublicHost("evil.example", async () => ["1.1.1.1", "127.0.0.1"])).rejects.toMatchObject({ reason: "dns_private" })
  })
  it("rejects AAAA loopback even when A is public", async () => {
    await expect(assertPublicHost("evil.example", async () => ["1.1.1.1", "::1"])).rejects.toMatchObject({ reason: "dns_private" })
  })
  it("rejects empty / failed resolution", async () => {
    await expect(assertPublicHost("nx.example", async () => [])).rejects.toMatchObject({ reason: "dns_failed" })
    await expect(assertPublicHost("nx.example", async () => { throw new Error("boom") })).rejects.toMatchObject({ reason: "dns_failed" })
  })
  it("returns ips for public hosts", async () => {
    await expect(assertPublicHost("ok.example", async () => ["104.18.0.1"])).resolves.toEqual(["104.18.0.1"])
  })
})

describe("createRequestFilter (per browser request, incl. redirects)", () => {
  it("blocks non-https, ip literals and private hosts; allows public; caches per host", async () => {
    let calls = 0
    const filter = createRequestFilter(async (h) => {
      calls++
      return h === "internal.example" ? ["10.0.0.5"] : ["104.18.0.1"]
    })
    expect(await filter("http://ok.example/a.js")).toBe(false)
    expect(await filter("https://169.254.169.254/")).toBe(false)
    expect(await filter("https://internal.example/redirect-target")).toBe(false)
    expect(await filter("https://ok.example/a.js")).toBe(true)
    expect(await filter("https://ok.example/b.css")).toBe(true)
    expect(await filter("ws://ok.example/socket")).toBe(false)
    expect(calls).toBe(2)
  })
})

describe("looksLikeFramerHtml", () => {
  it("detects generator meta but is only a heuristic", () => {
    expect(looksLikeFramerHtml('<html><head><meta name="generator" content="Framer 2a1b"></head>')).toBe(true)
    expect(looksLikeFramerHtml("<html><head></head>")).toBe(false)
  })
})
