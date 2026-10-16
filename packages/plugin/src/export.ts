import { type ComposeInput, pngSize, renderPng } from "@sitepromo/composer"

export type ExportKind = "download" | "canvas"

/** Render, verify the PNG header, then hand off. Never delivers a broken file. */
export async function exportPng(input: ComposeInput, scale: 1 | 2 | 3, kind: ExportKind, insert: (file: File) => Promise<void>, signal?: AbortSignal): Promise<void> {
  const blob = await renderPng(input, { scale, ...(signal ? { signal } : {}) })
  const size = await pngSize(blob)
  if (!size || size.width !== input.width * scale || size.height !== input.height * scale) throw new Error("export_broken")
  const name = `sitepromo-${input.preset}@${scale}x.png`
  const file = new File([blob], name, { type: "image/png" })
  if (kind === "canvas") return insert(file)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
