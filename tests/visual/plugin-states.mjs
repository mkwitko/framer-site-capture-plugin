// Screenshots every plugin state in mock mode (outside Framer) at two panel sizes.
// Run: node tests/visual/plugin-states.mjs   → tests/visual/__plugin__/<state>-<w>x<h>[-dark].png
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../..")
const out = join(here, "__plugin__")
mkdirSync(out, { recursive: true })

const vite = process.env.VITE_URL ? null : spawn("pnpm", ["--filter", "@sitepromo/plugin", "exec", "vite", "--port", "5199", "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
let url = process.env.VITE_URL ?? ""
if (!url) await new Promise((res, rej) => {
  const onData = (d) => { const m = /(https?:\/\/localhost:5199)/.exec(d.toString()); if (m) { url = m[1]; res() } }
  vite.stdout.on("data", onData); vite.stderr.on("data", onData)
  setTimeout(() => rej(new Error("vite did not start")), 30000)
})

const STATES = [
  ["ready", "ready", 0],
  ["unpublished", "unpublished", 0],
  ["capturing", "capturing", 900],
  ["compose", "compose", 3200],
  ["capture-failed", "capture-failed", 3200],
  ["no-permission", "no-permission", 3200],
]
const SIZES = [[320, 520], [420, 640]]
const browser = await chromium.launch({ channel: "chrome" })
for (const dark of [false, true]) {
  for (const [name, mock, wait] of STATES) {
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true, colorScheme: dark ? "dark" : "light" })
      // vite-plugin-framer shows a landing page unless the plugin runs inside an iframe, like in Framer.
      await page.setContent(`<body style="margin:0"><iframe id="f" src="${url}/?mock=${mock}" style="border:0;width:${w}px;height:${h}px"></iframe></body>`)
      const f = page.frameLocator("#f")
      await f.locator("main").waitFor(); await page.waitForTimeout(400)
      if (dark) await page.frames()[1].evaluate(() => document.documentElement.setAttribute("data-framer-theme", "dark"))
      if (mock !== "ready" && mock !== "unpublished") { await f.getByRole("button", { name: "Capture site" }).click(); await page.waitForTimeout(wait) }
      await page.screenshot({ path: join(out, `${name}-${w}x${h}${dark ? "-dark" : ""}.png`) })
      await page.close()
    }
  }
}
await browser.close()
vite?.kill()
console.log("plugin state screenshots →", out)
