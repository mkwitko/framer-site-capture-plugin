import { type RGB, isDark, mix, parseColor, readableOn, toHex } from "./color.js"
import { type Box, type Ctx, type Img, browserFrame, drawCoverTop, fitText, hairline, phoneFrame, screenRadius, softShadow, wrapLines } from "./draw.js"

export type PresetId = "hero" | "duo" | "sections"

export interface ComposeInput {
  preset: PresetId
  width: number
  height: number
  images: { desktop?: Img; mobile?: Img; sections?: Img[] }
  palette: { background: string; foreground?: string; accent?: string }
  title?: string
  subtitle?: string
  fontFamily?: string
}

export interface Theme {
  bg: RGB
  fg: RGB
  muted: RGB
  dark: boolean
  font: string
}

const FALLBACK_FONT = `"Inter", "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif`

export function theme(input: ComposeInput): Theme {
  const bg = parseColor(input.palette.background) ?? { r: 245, g: 245, b: 247 }
  const fg = readableOn(bg, input.palette.foreground ? parseColor(input.palette.foreground) : null)
  const dark = isDark(bg)
  return { bg, fg, muted: mix(fg, bg, 0.45), dark, font: input.fontFamily ? `"${input.fontFamily.replace(/["\\]/g, "")}", ${FALLBACK_FONT}` : FALLBACK_FONT }
}

/** Subtle two-stop background so flat colours do not look like a bug, kept within ~3% lightness. */
export function paintBackground(ctx: Ctx, w: number, h: number, t: Theme) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  const edge = mix(t.bg, t.dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.035)
  g.addColorStop(0, toHex(t.bg))
  g.addColorStop(1, toHex(edge))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Title + subtitle block. Returns height consumed. */
export function heading(ctx: Ctx, t: Theme, box: Box, title?: string, subtitle?: string, align: CanvasTextAlign = "left"): number {
  if (!title && !subtitle) return 0
  const x = align === "center" ? box.x + box.w / 2 : box.x
  let y = box.y
  ctx.textAlign = align
  ctx.textBaseline = "alphabetic"
  if (title) {
    const size = fitText(ctx, title, box.w, t.font, 650, Math.round(box.w * 0.052), 28)
    const lines = wrapLines(ctx, title, box.w, 2)
    ctx.fillStyle = toHex(t.fg)
    for (const line of lines) {
      y += size
      ctx.fillText(line, x, y)
      y += size * 0.16
    }
  }
  if (subtitle) {
    const size = Math.max(16, Math.round(box.w * 0.02))
    ctx.font = `450 ${size}px ${t.font}`
    const lines = wrapLines(ctx, subtitle, box.w, 2)
    ctx.fillStyle = toHex(t.muted)
    y += title ? size * 0.5 : 0
    for (const line of lines) {
      y += size
      ctx.fillText(line, x, y)
      y += size * 0.3
    }
  }
  return y - box.y
}

function placeholder(ctx: Ctx, b: Box, t: Theme, r: number) {
  ctx.save()
  ctx.fillStyle = toHex(mix(t.bg, t.fg, 0.06))
  roundedFill(ctx, b, r)
  ctx.restore()
}
function roundedFill(ctx: Ctx, b: Box, r: number) {
  // local import avoided: reuse draw.roundRect via hairline path style
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, r)
  ctx.fill()
}

/** Preset 1: single desktop screenshot in a browser frame, title above, generous margins. */
export function hero(ctx: Ctx, input: ComposeInput, t: Theme) {
  const { width: W, height: H } = input
  const pad = Math.round(W * 0.075)
  const textBox: Box = { x: pad, y: pad, w: W - pad * 2, h: 0 }
  const used = heading(ctx, t, textBox, input.title, input.subtitle, "center")
  const top = pad + used + (used ? Math.round(H * 0.05) : 0)
  const frame: Box = { x: pad, y: top, w: W - pad * 2, h: H - top + Math.round(H * 0.06) } // bleeds off bottom on purpose
  const r = Math.round(W * 0.011)
  softShadow(ctx, frame, r, W / 1600)
  const content = browserFrame(ctx, frame, t.dark, r)
  const img = input.images.desktop
  if (img) drawCoverTop(ctx, img, { ...content, h: content.h }, 0)
  else placeholder(ctx, content, t, 0)
  hairline(ctx, frame, r, t.dark)
}

/** Preset 2: desktop frame left, phone overlapping bottom-right. */
export function duo(ctx: Ctx, input: ComposeInput, t: Theme) {
  const { width: W, height: H } = input
  const pad = Math.round(W * 0.07)
  const used = heading(ctx, t, { x: pad, y: pad, w: W * 0.62, h: 0 }, input.title, input.subtitle)
  const top = pad + used + (used ? Math.round(H * 0.05) : 0)
  const deskW = Math.round((W - pad * 2) * 0.78)
  const desk: Box = { x: pad, y: top, w: deskW, h: H - top + Math.round(H * 0.08) }
  const r = Math.round(W * 0.011)
  softShadow(ctx, desk, r, W / 1600)
  const content = browserFrame(ctx, desk, t.dark, r)
  if (input.images.desktop) drawCoverTop(ctx, input.images.desktop, content, 0)
  else placeholder(ctx, content, t, 0)
  hairline(ctx, desk, r, t.dark)

  const phoneW = Math.round(W * 0.19)
  const phoneH = Math.round(phoneW * 2.05)
  // Phone sits lower than the browser's title bar so the site header stays readable; bleeds off the bottom.
  const phone: Box = { x: W - pad - phoneW, y: Math.max(top + Math.round(H * 0.18), H - phoneH + Math.round(H * 0.08)), w: phoneW, h: phoneH }
  const pr = Math.round(phoneW * 0.14)
  softShadow(ctx, phone, pr, (W / 1600) * 1.2)
  const screen = phoneFrame(ctx, phone, t.dark)
  const sr = screenRadius(screen)
  if (input.images.mobile) drawCoverTop(ctx, input.images.mobile, screen, sr)
  else placeholder(ctx, screen, t, sr)
  hairline(ctx, phone, pr, true)
}

/** Preset 3: editorial two-column layout; each crop keeps its own aspect ratio (no cover-cropping). */
export function sections(ctx: Ctx, input: ComposeInput, t: Theme) {
  const { width: W, height: H } = input
  const pad = Math.round(W * 0.06)
  const gap = Math.round(W * 0.02)
  const imgs = (input.images.sections ?? []).filter((i) => i.width > 0 && i.height > 0).slice(0, 4)
  const r = Math.round(W * 0.009)
  const hasText = Boolean(input.title || input.subtitle)
  const textW = hasText ? Math.round((W - pad * 2) * 0.3) : 0
  if (hasText) heading(ctx, t, { x: pad, y: pad, w: textW, h: 0 }, input.title, input.subtitle)
  const gridX = pad + (hasText ? textW + gap * 2 : 0)
  const gridW = W - pad - gridX
  const gridH = H - pad * 2
  if (imgs.length === 0) {
    placeholder(ctx, { x: gridX, y: pad, w: gridW, h: gridH }, t, r)
    return
  }
  // Wide, short crops (typical website bands) read better stacked full-width; squarer crops go in two columns.
  const meanAspect = imgs.reduce((a, i) => a + Math.max(i.width / i.height, 1 / 0.9), 0) / imgs.length
  const cols = imgs.length <= 2 || meanAspect >= 2.2 ? 1 : 2
  const colW = (gridW - gap * (cols - 1)) / cols
  // Distribute to the shortest column, then scale heights so the tallest column fits gridH.
  const columns: { img: Img; h: number }[][] = Array.from({ length: cols }, () => [])
  const colH = Array<number>(cols).fill(0)
  // Very tall crops (long sections) are capped to ~square; cover-top keeps the top of the section.
  const MAX_ASPECT_H = 0.9
  for (const img of imgs) {
    const c = colH.indexOf(Math.min(...colH))
    const h = colW * Math.min(img.height / img.width, MAX_ASPECT_H)
    columns[c]?.push({ img, h })
    colH[c] = (colH[c] ?? 0) + h + gap
  }
  const tallest = Math.max(...colH) - gap
  const k = Math.min(1, gridH / tallest)
  const yStart = pad + Math.max(0, (gridH - tallest * k) / 2) // vertically centre short stacks
  columns.forEach((col, ci) => {
    let y = yStart
    for (const { img, h } of col) {
      const b: Box = { x: gridX + ci * (colW + gap), y, w: colW, h: Math.round(h * k) }
      softShadow(ctx, b, r, (W / 1600) * 0.7)
      drawCoverTop(ctx, img, b, r)
      hairline(ctx, b, r, t.dark)
      y += b.h + gap
    }
  })
}

export const PRESETS: Record<PresetId, (ctx: Ctx, input: ComposeInput, t: Theme) => void> = { hero, duo, sections }
