// Bundles packages/composer with esbuild, renders every preset x fixture site in Chrome,
// writes PNGs to tests/visual/__out__/ and a manifest with sizes. Also exercises renderPng
// at 1x/2x/3x + pngSize + fflate zip (Spike E) and reports timings (Spike F).
import { build } from "esbuild"
import { chromium } from "playwright"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../..")
const out = join(here, "__out__")
mkdirSync(out, { recursive: true })
const fx = join(root, "tests/fixtures/sites/png")
const sites = JSON.parse(readFileSync(join(fx, "index.json"), "utf8"))
const outDir = out
mkdirSync(outDir, { recursive: true })

const bundle = await build({
  entryPoints: [join(root, "packages/composer/src/index.ts")],
  bundle: true, format: "iife", globalName: "Composer", write: false, target: "es2022",
})
const fflate = await build({ stdin: { contents: "export * from \"fflate\"", resolveDir: root }, bundle: true, format: "iife", globalName: "fflate", write: false })

const PALETTES = {
  light: { background: "#ffffff", foreground: "#111113" },
  dark: { background: "#0b0b0c", foreground: "#f5f5f7" },
  vivid: { background: "#1a0a3c", foreground: "#ffe9f0", accent: "#ff4d8d" },
  minimal: { background: "#f7f6f3", foreground: "#2a2a28" },
  tallhero: { background: "#e9f1ff", foreground: "#0a1f44" },
  cards: { background: "#fafafa", foreground: "#18181b" },
}
const TITLES = { light: "Northwind — Brand & Web", dark: "Obsidian", vivid: "Pulse: a very long title that should wrap gracefully onto two lines without breaking the layout", minimal: undefined, tallhero: "Altitude", cards: "Gridworks" }

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.setContent(`<!doctype html><body style="margin:0"><canvas id=c width=1600 height=1000></canvas></body>`)
await page.addScriptTag({ content: bundle.outputFiles[0].text })
await page.addScriptTag({ content: fflate.outputFiles[0].text })

const toDataUrl = (f) => `data:image/png;base64,${readFileSync(join(fx, f)).toString("base64")}`
const manifest = []
for (const site of sites) {
  const imgs = {
    desktop: toDataUrl(`${site}-desktop.png`),
    mobile: toDataUrl(`${site}-mobile.png`),
    sections: ["hero", "section1", "cta"].map((s) => { try { return toDataUrl(`${site}-section-${s}.png`) } catch { return null } }).filter(Boolean),
  }
  const res = await page.evaluate(async ({ imgs, palette, title, subtitle }) => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src })
    const images = { desktop: await load(imgs.desktop), mobile: await load(imgs.mobile), sections: await Promise.all(imgs.sections.map(load)) }
    if (!palette) {
      // Sample the site's own background from the top-left of the desktop screenshot.
      const cv = new OffscreenCanvas(1, 1); const cx = cv.getContext("2d"); cx.drawImage(images.desktop, 0, 0, 1, 1, 0, 0, 1, 1)
      const [r, g, b] = cx.getImageData(0, 0, 1, 1).data
      palette = { background: `rgb(${r},${g},${b})` }
    }
    const results = {}
    for (const preset of ["hero", "duo", "sections"]) {
      const input = { preset, width: 1600, height: 1000, images, palette, title, subtitle }
      const c = document.getElementById("c")
      const t0 = performance.now()
      Composer.compose(c.getContext("2d"), input, 1)
      const composeMs = performance.now() - t0
      const png1 = c.toDataURL("image/png")
      const scales = {}
      for (const scale of [1, 2, 3]) {
        const t1 = performance.now()
        const blob = await Composer.renderPng(input, { scale })
        const size = await Composer.pngSize(blob)
        scales[scale] = { bytes: blob.size, ...size, ms: Math.round(performance.now() - t1) }
      }
      results[preset] = { composeMs: Math.round(composeMs), png1, scales }
    }
    // Spike E: zip the three 2x renders with fflate and verify it is a valid zip we can unzip back.
    const t2 = performance.now()
    const files = {}
    for (const preset of ["hero", "duo", "sections"]) {
      const blob = await Composer.renderPng({ preset, width: 1600, height: 1000, images, palette, title, subtitle }, { scale: 2 })
      files[`${preset}@2x.png`] = new Uint8Array(await blob.arrayBuffer())
    }
    const zipped = fflate.zipSync(files, { level: 0 })
    const back = fflate.unzipSync(zipped)
    const zipOk = Object.keys(back).length === 3 && Object.entries(files).every(([k, v]) => back[k].length === v.length)
    results.zip = { bytes: zipped.length, ms: Math.round(performance.now() - t2), ok: zipOk, memoryMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }
    return results
  }, { imgs, palette: PALETTES[site] ?? null, title: TITLES[site] ?? site, subtitle: site === "minimal" ? undefined : "Framer site · 2026" })
  for (const preset of ["hero", "duo", "sections"]) {
    writeFileSync(join(outDir, `${site}-${preset}.png`), Buffer.from(res[preset].png1.split(",")[1], "base64"))
    manifest.push({ site, preset, composeMs: res[preset].composeMs, scales: res[preset].scales })
  }
  manifest.push({ site, zip: res.zip })
}
await browser.close()
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))
console.table(manifest.filter((m) => m.preset).map((m) => ({ site: m.site, preset: m.preset, composeMs: m.composeMs, "1x": `${m.scales[1].width}x${m.scales[1].height} ${Math.round(m.scales[1].bytes / 1024)}KB ${m.scales[1].ms}ms`, "2x": `${m.scales[2].width}x${m.scales[2].height} ${Math.round(m.scales[2].bytes / 1024)}KB ${m.scales[2].ms}ms`, "3x": `${m.scales[3].width}x${m.scales[3].height} ${Math.round(m.scales[3].bytes / 1024)}KB ${m.scales[3].ms}ms` })))
console.table(manifest.filter((m) => m.zip).map((m) => ({ site: m.site, ...m.zip })))
