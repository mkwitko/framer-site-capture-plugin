import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"
import { describe, expect, it, beforeAll } from "vitest"

const dir = import.meta.dirname
const out = join(dir, "__out__")
const baseline = join(dir, "__baseline__")
// Tolerance: fonts/antialiasing differ slightly across Chrome builds; 0.5% of pixels is the agreed budget.
const MAX_DIFF_RATIO = 0.005

describe("composer presets visual regression", () => {
  beforeAll(() => {
    execFileSync("node", [join(dir, "render-presets.mjs")], { stdio: "ignore", timeout: 120_000 })
  }, 150_000)

  it("renders every preset for every fixture at exact logical size", () => {
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as { site?: string; preset?: string; scales?: Record<string, { width: number; height: number; bytes: number }>; zip?: { ok: boolean } }[]
    const renders = manifest.filter((m) => m.preset)
    expect(renders.length).toBe(18)
    for (const m of renders) {
      for (const s of [1, 2, 3]) {
        expect(m.scales?.[s]).toMatchObject({ width: 1600 * s, height: 1000 * s })
        expect(m.scales?.[s]?.bytes).toBeGreaterThan(20_000)
      }
    }
    expect(manifest.filter((m) => m.zip).every((m) => m.zip?.ok)).toBe(true)
  })

  it("matches baselines within tolerance (run with UPDATE_BASELINE=1 to accept)", () => {
    mkdirSync(baseline, { recursive: true })
    const files = readdirSync(out).filter((f) => f.endsWith(".png"))
    const failures: string[] = []
    for (const f of files) {
      const b = join(baseline, f)
      if (!existsSync(b) || process.env.UPDATE_BASELINE) {
        copyFileSync(join(out, f), b)
        continue
      }
      const a = PNG.sync.read(readFileSync(join(out, f)))
      const e = PNG.sync.read(readFileSync(b))
      if (a.width !== e.width || a.height !== e.height) {
        failures.push(`${f}: size ${a.width}x${a.height} != ${e.width}x${e.height}`)
        continue
      }
      const diff = pixelmatch(a.data, e.data, null, a.width, a.height, { threshold: 0.1 })
      const ratio = diff / (a.width * a.height)
      if (ratio > MAX_DIFF_RATIO) failures.push(`${f}: ${(ratio * 100).toFixed(2)}% pixels differ`)
    }
    expect(failures).toEqual([])
  })
})
