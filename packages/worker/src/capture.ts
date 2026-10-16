import puppeteer, { type Browser } from "@cloudflare/puppeteer"
import { detectSections, PREPARE_PAGE_SCRIPT, SETTLE_SCRIPT, type DetectedSection } from "@sitepromo/capture-core"
import { VIEWPORTS, type Viewport } from "@sitepromo/contracts"
import { createRequestFilter, type Resolver } from "./url-guard.js"

export interface CaptureResult {
  viewport: Viewport
  pageHeight: number
  fullPage: string // base64 PNG
  sections: (DetectedSection & { png: string })[]
  timings: { load: number; settle: number; screenshots: number }
  blockedRequests: number
}

const MAX_SECTIONS = 6
const MAX_SECTION_HEIGHT = 4000
const MAX_FULL_HEIGHT = 12000 // bounds Worker memory: base64 PNG of 1440×12000 stays well under 128 MB
const NAV_TIMEOUT_MS = 25_000

/**
 * One browser session per job; pages opened sequentially per viewport.
 * Every request the page makes passes through the same guard as the entry URL.
 */
export async function captureSite(
  binding: Fetcher,
  url: string,
  viewports: Viewport[],
  resolve?: Resolver,
): Promise<CaptureResult[]> {
  const browser: Browser = await puppeteer.launch(binding)
  const allow = createRequestFilter(resolve)
  const results: CaptureResult[] = []
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage()
      let blockedRequests = 0
      await page.setRequestInterception(true)
      page.on("request", (req) => {
        const u = req.url()
        const inline = u.startsWith("data:") || u.startsWith("blob:") // no network; needed for inline images/fonts
        ;(inline ? Promise.resolve(true) : allow(u))
          .then((ok) => {
            if (ok) return req.continue()
            blockedRequests++
            return req.abort("blockedbyclient")
          })
          .catch(() => {}) // request already handled or page closed
      })
      const { width, height } = VIEWPORTS[viewport]
      await page.setViewport({ width, height, deviceScaleFactor: viewport === "mobile" ? 2 : 1 })
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])

      const t0 = Date.now()
      const nav = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS })
      if (nav && !nav.ok()) throw new Error(`upstream ${nav.status()}`)
      const t1 = Date.now()
      await page.evaluate(PREPARE_PAGE_SCRIPT)
      await page.evaluate(SETTLE_SCRIPT)
      const t2 = Date.now()

      const docH = await page.evaluate(() => document.documentElement.scrollHeight)
      const fullPage = (await page.screenshot({ clip: { x: 0, y: 0, width, height: Math.min(docH, MAX_FULL_HEIGHT) }, captureBeyondViewport: true, encoding: "base64" })) as string
      const detected = (await page.evaluate(detectSections, { max: 12 })) as DetectedSection[]
      const top = [...detected].sort((a, b) => b.score - a.score).slice(0, MAX_SECTIONS).sort((a, b) => a.index - b.index)
      const sections: CaptureResult["sections"] = []
      for (const s of top) {
        const clip = { x: s.rect.x, y: s.rect.y, width: s.rect.width, height: Math.min(s.rect.height, MAX_SECTION_HEIGHT) }
        const png = (await page.screenshot({ clip, encoding: "base64", captureBeyondViewport: true })) as string
        sections.push({ ...s, png })
      }
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      const t3 = Date.now()
      await page.close()
      results.push({ viewport, pageHeight, fullPage, sections, blockedRequests, timings: { load: t1 - t0, settle: t2 - t1, screenshots: t3 - t2 } })
    }
  } finally {
    await browser.close()
  }
  return results
}
