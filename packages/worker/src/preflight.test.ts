import { describe, expect, it } from "vitest"
import { preflight } from "./preflight.js"

const publicResolver = async (h: string) => (h.includes("internal") ? ["10.0.0.1"] : ["104.18.0.1"])
const mk = (routes: Record<string, { status: number; headers?: Record<string, string>; body?: string }>) =>
  (async (url: string | URL | Request) => {
    const r = routes[String(url)]
    if (!r) return new Response("nf", { status: 404 })
    return new Response(r.body ?? "", { status: r.status, headers: r.headers })
  }) as typeof fetch

describe("preflight", () => {
  it("follows https redirects and revalidates each hop", async () => {
    const f = mk({
      "https://a.framer.website/": { status: 301, headers: { location: "https://b.framer.website/" } },
      "https://b.framer.website/": { status: 200, body: "" },
    })
    const r = await preflight("https://a.framer.website/", { fetch: f, resolve: publicResolver })
    expect(r.target.hostname).toBe("b.framer.website")
    expect(r.hops).toBe(1)
  })
  it("blocks redirect to http / ip / private host", async () => {
    for (const loc of ["http://b.framer.website/", "https://169.254.169.254/", "https://internal.example/"]) {
      const f = mk({ "https://a.framer.website/": { status: 302, headers: { location: loc } } })
      await expect(preflight("https://a.framer.website/", { fetch: f, resolve: publicResolver })).rejects.toBeTruthy()
    }
  })
  it("limits redirect chain", async () => {
    const f = mk({
      "https://a.framer.website/": { status: 302, headers: { location: "https://a.framer.website/1" } },
      "https://a.framer.website/1": { status: 302, headers: { location: "https://a.framer.website/2" } },
      "https://a.framer.website/2": { status: 302, headers: { location: "https://a.framer.website/3" } },
      "https://a.framer.website/3": { status: 302, headers: { location: "https://a.framer.website/4" } },
      "https://a.framer.website/4": { status: 200 },
    })
    await expect(preflight("https://a.framer.website/", { fetch: f, resolve: publicResolver })).rejects.toMatchObject({ message: "too many redirects" })
  })
  it("custom domain requires Framer generator meta", async () => {
    const f = mk({ "https://studio.example/": { status: 200, body: "<html><head><title>x</title></head>" } })
    await expect(preflight("https://studio.example/", { fetch: f, resolve: publicResolver })).rejects.toMatchObject({ message: "not a Framer site" })
    const g = mk({ "https://studio.example/": { status: 200, body: '<meta name="generator" content="Framer abc">' } })
    await expect(preflight("https://studio.example/", { fetch: g, resolve: publicResolver })).resolves.toBeTruthy()
  })
  it("rejects non-2xx upstream", async () => {
    const f = mk({ "https://a.framer.website/": { status: 404 } })
    await expect(preflight("https://a.framer.website/", { fetch: f, resolve: publicResolver })).rejects.toBeTruthy()
  })
})
