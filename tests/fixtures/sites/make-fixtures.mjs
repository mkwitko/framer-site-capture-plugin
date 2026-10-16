// Renders synthetic "sites" (light/dark/vivid/minimal/tall-hero/cards) to PNG fixtures
// for desktop (1440x900 full page) and mobile (390x844 @2x). Deterministic: no web fonts, no animation.
import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "png")
mkdirSync(out, { recursive: true })

const site = (id, { bg, fg, accent, font = "system-ui", heroH = 620, cards = 3, sections = 3, title }) => `<!doctype html><html><head><meta charset=utf-8><style>
*{box-sizing:border-box;margin:0}body{background:${bg};color:${fg};font-family:${font};-webkit-font-smoothing:antialiased}
header{display:flex;justify-content:space-between;padding:24px 48px;font-weight:600}
.hero{min-height:${heroH}px;display:flex;flex-direction:column;justify-content:center;padding:48px;gap:20px}
.hero h1{font-size:clamp(40px,7vw,96px);line-height:.95;letter-spacing:-.03em;max-width:14ch}
.hero p{font-size:20px;opacity:.7;max-width:48ch}.btn{display:inline-block;background:${accent};color:${bg};padding:14px 24px;border-radius:999px;font-weight:600;width:max-content}
section{padding:72px 48px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.card{background:color-mix(in srgb,${fg} 6%,${bg});border:1px solid color-mix(in srgb,${fg} 10%,${bg});border-radius:16px;padding:28px;min-height:220px}
.card h3{margin-bottom:10px}.band{background:${accent};color:${bg};padding:96px 48px;font-size:44px;font-weight:700;letter-spacing:-.02em}
footer{padding:48px;opacity:.6;font-size:14px}
</style></head><body>
<header><span>${title}</span><span>Work · About · Contact</span></header>
<div class=hero data-framer-name="Hero"><h1>${title} builds ${id === "minimal" ? "less" : "products people love"}.</h1><p>Independent studio for brand, web and product. Fast, precise, no fluff.</p><span class=btn>Start a project</span></div>
${Array.from({ length: sections }, (_, i) => `<section data-framer-name="Section ${i + 1}"><h2 style="font-size:32px;margin-bottom:24px">Selected work ${i + 1}</h2><div class=grid>${Array.from({ length: cards }, (_, j) => `<div class=card><h3>Project ${j + 1}</h3><p>Brand identity, website and launch assets.</p></div>`).join("")}</div></section>`).join("")}
<div class=band data-framer-name="CTA">Let's make something.</div>
<footer>© 2026 ${title}. All rights reserved.</footer></body></html>`

const SITES = {
  light: { bg: "#ffffff", fg: "#111113", accent: "#111113", title: "Northwind" },
  dark: { bg: "#0b0b0c", fg: "#f5f5f7", accent: "#f5f5f7", title: "Obsidian" },
  vivid: { bg: "#1a0a3c", fg: "#ffe9f0", accent: "#ff4d8d", title: "Pulse", font: "Georgia, serif" },
  minimal: { bg: "#f7f6f3", fg: "#2a2a28", accent: "#2a2a28", title: "Studio Ko", cards: 1, sections: 1, heroH: 760 },
  tallhero: { bg: "#e9f1ff", fg: "#0a1f44", accent: "#1d4ed8", title: "Altitude", heroH: 1400 },
  cards: { bg: "#fafafa", fg: "#18181b", accent: "#16a34a", title: "Gridworks", cards: 9, sections: 4 },
}

const browser = await chromium.launch({ channel: "chrome" })
for (const [id, cfg] of Object.entries(SITES)) {
  for (const vp of ["desktop", "mobile"]) {
    const page = await browser.newPage({
      viewport: vp === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 },
      deviceScaleFactor: vp === "desktop" ? 1 : 2,
    })
    await page.setContent(site(id, cfg))
    await page.screenshot({ path: join(out, `${id}-${vp}.png`), fullPage: true })
    if (vp === "desktop") {
      const rects = await page.$$eval("[data-framer-name]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { name: e.dataset.framerName, x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 1200) } }))
      for (const r of rects) await page.screenshot({ path: join(out, `${id}-section-${r.name.replace(/\s+/g, "").toLowerCase()}.png`), clip: r, fullPage: true })
    }
    await page.close()
  }
}
await browser.close()
writeFileSync(join(out, "index.json"), JSON.stringify(Object.keys(SITES)))
console.log("fixtures written to", out)
