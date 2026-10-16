/** Minimal colour maths: parse hex/rgb, relative luminance, contrast, mix. */

export interface RGB { r: number; g: number; b: number }

export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase()
  const hex = /^#?([0-9a-f]{3,8})$/.exec(s)?.[1]
  if (hex) {
    const h = hex.length <= 4 ? hex.split("").map((c) => c + c).join("") : hex
    if (h.length < 6) return null
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(s)
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  return null
}

export const toHex = ({ r, g, b }: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`

export function luminance({ r, g, b }: RGB): number {
  const f = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}

export const mix = (a: RGB, b: RGB, t: number): RGB => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })

export const isDark = (c: RGB) => luminance(c) < 0.35

/** Pick a foreground (preferred, else white/black) that reaches >= 4.5:1 on bg. */
export function readableOn(bg: RGB, preferred?: RGB | null): RGB {
  if (preferred && contrast(bg, preferred) >= 4.5) return preferred
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 17, g: 17, b: 19 }
  return contrast(bg, white) >= contrast(bg, black) ? white : black
}

/** Sample the dominant edge colour of an image (average of a 1px frame). Used to extend site background behind the screenshot. */
export function edgeColor(ctx: { getImageData(x: number, y: number, w: number, h: number): ImageData }, w: number, h: number): RGB {
  const samples = [ctx.getImageData(0, 0, w, 1).data, ctx.getImageData(0, h - 1, w, 1).data]
  let r = 0, g = 0, b = 0, n = 0
  for (const d of samples) for (let i = 0; i < d.length; i += 4) { r += d[i] ?? 0; g += d[i + 1] ?? 0; b += d[i + 2] ?? 0; n++ }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 255, g: 255, b: 255 }
}
