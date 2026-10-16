import type { Viewport } from "@sitepromo/contracts"
import type { ProjectSnapshot } from "../framer/project.ts"
import type { Shot } from "../state/model.ts"

/**
 * Mock mode for running the panel outside Framer (visual QA with Playwright): `?mock=<state>`.
 * Uses the Spike B captures served from /mock/<site>/*.png (copied into public/ by tests/visual/plugin-states.mjs).
 */
export const mockState = new URLSearchParams(location.search).get("mock")

export const mockProject = (published: boolean): ProjectSnapshot => ({
  name: "Porteo Portfolio",
  id: "mock",
  publishedUrl: published ? "https://demo.framer.website" : null,
  stagingUrl: null,
  deploymentTime: Date.now(),
  pages: [{ path: "/", collectionId: null, draft: false }, { path: "/about", collectionId: null, draft: false }, { path: "/work", collectionId: null, draft: false }],
  colors: [{ name: "Ink", light: "#111113", dark: "#111113" }, { name: "Paper", light: "#f5f5f7", dark: "#f5f5f7" }, { name: "Signal", light: "#ff4d1f", dark: "#ff4d1f" }],
  fonts: [{ family: "Inter", weight: 500, url: null }],
  textStyles: [],
  locales: 1,
  canAddImage: mockState !== "no-permission",
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function* mockCapture(site = "demo", signal: AbortSignal): AsyncGenerator<Shot> {
  const files: [Viewport, string, "full" | "section", string | null][] = [
    ["desktop", "desktop-full", "full", null], ["desktop", "desktop-s0", "section", "Hero"], ["desktop", "desktop-s1", "section", "About"],
    ["desktop", "desktop-s2", "section", "Featured projects"], ["desktop", "desktop-s3", "section", "Services"], ["mobile", "mobile-full", "full", null],
  ]
  for (const [viewport, f, kind, name] of files) {
    await sleep(350)
    if (signal.aborted) return
    if (mockState === "capture-failed" && f === "desktop-s1") throw new Error("mock failure")
    const blob = await (await fetch(`/mock/${site}/${f}.png`)).blob()
    yield { id: `${viewport}-${f}`, kind, viewport, name, bitmap: await createImageBitmap(blob) }
  }
}
