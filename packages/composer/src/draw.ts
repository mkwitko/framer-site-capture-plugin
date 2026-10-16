/** Small Canvas 2D helpers. Pure drawing, no layout decisions. */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type Img = CanvasImageSource & { width: number; height: number }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function roundRect(ctx: Ctx, b: Box, r: number) {
  const rr = Math.min(r, b.w / 2, b.h / 2)
  ctx.beginPath()
  ctx.moveTo(b.x + rr, b.y)
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, rr)
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, rr)
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, rr)
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, rr)
  ctx.closePath()
}

/** Layered soft shadow: one wide ambient + one tight contact shadow. Reads natural on light and dark. */
export function softShadow(ctx: Ctx, b: Box, r: number, strength = 1) {
  const layers: [number, number, number][] = [
    [60 * strength, 24 * strength, 0.18],
    [16 * strength, 6 * strength, 0.12],
  ]
  for (const [blur, offset, alpha] of layers) {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${alpha})`
    ctx.shadowBlur = blur
    ctx.shadowOffsetY = offset
    ctx.fillStyle = "rgba(0,0,0,1)"
    roundRect(ctx, b, r)
    ctx.fill()
    ctx.restore()
  }
}

/** Draw image covering box, cropped from the top (screenshots: keep the hero, not the footer).
 * If the image is shorter than the box, the remainder is filled with the image's bottom-edge colour
 * so short sections never show a hole. */
export function drawCoverTop(ctx: Ctx, img: Img, b: Box, r: number) {
  const scale = b.w / img.width
  const srcH = Math.min(img.height, b.h / scale)
  ctx.save()
  roundRect(ctx, b, r)
  ctx.clip()
  const drawnH = srcH * scale
  if (drawnH < b.h) {
    ctx.fillStyle = bottomEdgeColor(img)
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  ctx.drawImage(img, 0, 0, img.width, srcH, b.x, b.y, b.w, drawnH)
  ctx.restore()
}

/** Average colour of the last pixel row of an image. */
export function bottomEdgeColor(img: Img): string {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(img.width, 1) : Object.assign(document.createElement("canvas"), { width: img.width, height: 1 })
  const cx = c.getContext("2d") as Ctx | null
  if (!cx) return "#808080"
  cx.drawImage(img, 0, img.height - 1, img.width, 1, 0, 0, img.width, 1)
  const d = cx.getImageData(0, 0, img.width, 1).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i] ?? 0; g += d[i + 1] ?? 0; b += d[i + 2] ?? 0; n++ }
  return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : "#808080"
}

/** Hairline border that follows the rounded rect, adapts to dark/light background. */
export function hairline(ctx: Ctx, b: Box, r: number, dark: boolean) {
  ctx.save()
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"
  ctx.lineWidth = 1
  roundRect(ctx, { x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 }, r)
  ctx.stroke()
  ctx.restore()
}

/** Browser window chrome: title bar with three dots. Returns the content box. */
export function browserFrame(ctx: Ctx, b: Box, dark: boolean, r = 14): Box {
  const bar = Math.round(b.w * 0.028) + 16
  ctx.save()
  ctx.fillStyle = dark ? "#1c1c1e" : "#f3f3f4"
  roundRect(ctx, b, r)
  ctx.fill()
  const dot = Math.max(5, Math.round(bar * 0.26))
  const cy = b.y + bar / 2
  const colors = dark ? ["#3a3a3c", "#3a3a3c", "#3a3a3c"] : ["#e0e0e2", "#e0e0e2", "#e0e0e2"]
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(b.x + bar * 0.75 + i * dot * 1.9, cy, dot / 2, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
  return { x: b.x, y: b.y + bar, w: b.w, h: b.h - bar }
}

/** Phone bezel: dark rounded rect with inner screen. Returns the screen box. */
export function phoneFrame(ctx: Ctx, b: Box, dark: boolean): Box {
  const bezel = Math.max(6, Math.round(b.w * 0.028))
  const r = Math.round(b.w * 0.14)
  ctx.save()
  ctx.fillStyle = dark ? "#0b0b0c" : "#111113"
  roundRect(ctx, b, r)
  ctx.fill()
  ctx.restore()
  return { x: b.x + bezel, y: b.y + bezel, w: b.w - bezel * 2, h: b.h - bezel * 2 }
}

export function screenRadius(screen: Box) {
  return Math.round(screen.w * 0.11)
}

/** Largest size (down to min) at which text wraps into <= maxLines without ellipsis; sets ctx.font. */
export function fitText(ctx: Ctx, text: string, maxW: number, family: string, weight: number, size: number, min: number, maxLines = 2): number {
  let s = size
  for (; s > min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`
    const lines = wrapLines(ctx, text, maxW, maxLines)
    if (!lines.some((l) => l.endsWith("…"))) break
  }
  ctx.font = `${weight} ${s}px ${family}`
  return s
}

/** Break text into at most maxLines lines that fit maxW with current ctx.font; last line gets an ellipsis. */
export function wrapLines(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width <= maxW || !cur) cur = t
    else {
      lines.push(cur)
      cur = w
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1] ?? ""
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd()
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}
