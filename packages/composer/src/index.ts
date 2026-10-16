import { PRESETS, paintBackground, theme, type ComposeInput, type PresetId } from "./presets.js"

export type { ComposeInput, PresetId }
export type { Img } from "./draw.js"
export { contrast, parseColor, readableOn } from "./color.js"

export const PRESET_LIST: { id: PresetId; name: string; needs: ("desktop" | "mobile" | "sections")[] }[] = [
  { id: "hero", name: "Hero", needs: ["desktop"] },
  { id: "duo", name: "Devices", needs: ["desktop", "mobile"] },
  { id: "sections", name: "Sections", needs: ["sections"] },
]

/** Draw a composition at logical size input.width x input.height, scaled by `scale`. Deterministic. */
export function compose(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, input: ComposeInput, scale = 1) {
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const t = theme(input)
  paintBackground(ctx, input.width, input.height, t)
  PRESETS[input.preset](ctx, input, t)
  ctx.restore()
}

export interface RenderOptions {
  scale: 1 | 2 | 3
  signal?: AbortSignal
}

/** Render to a PNG Blob. Uses OffscreenCanvas when available, falls back to a DOM canvas. */
export async function renderPng(input: ComposeInput, { scale, signal }: RenderOptions): Promise<Blob> {
  const w = input.width * scale
  const h = input.height * scale
  signal?.throwIfAborted()
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h)
    const ctx = c.getContext("2d")
    if (!ctx) throw new Error("no 2d context")
    compose(ctx, input, scale)
    signal?.throwIfAborted()
    return c.convertToBlob({ type: "image/png" })
  }
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  compose(ctx, input, scale)
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"))
}

/** Read PNG dimensions from the IHDR chunk; used to refuse exporting broken files. */
export async function pngSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const head = new DataView(await blob.slice(0, 24).arrayBuffer())
  if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47) return null
  return { width: head.getUint32(16), height: head.getUint32(20) }
}
