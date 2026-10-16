export interface DetectedSection {
  index: number
  name: string | null
  tag: string
  rect: { x: number; y: number; width: number; height: number }
  score: number
  textChars: number
  images: number
}

export interface DetectOptions {
  minHeight?: number
  minWidthRatio?: number
  max?: number
}

/**
 * Runs inside the page. Must stay self-contained (no closures over module scope)
 * because it is serialized and evaluated by the browser driver.
 *
 * Strategy (ponytail: heuristics, no ML):
 * 1. Prefer semantic/Framer section candidates: <section>, <header>, <footer>,
 *    and direct children of the Framer root (#main or body > div) that are
 *    wide, tall "band" elements.
 * 2. Drop candidates that are nested inside an already chosen candidate.
 * 3. Score = visual mass (height, images, text) so callers can rank.
 */
export function detectSections(opts: DetectOptions = {}): DetectedSection[] {
  const minHeight = opts.minHeight ?? 160
  const minWidthRatio = opts.minWidthRatio ?? 0.6
  const max = opts.max ?? 12
  const vw = window.innerWidth

  const root =
    document.querySelector("#main") ??
    document.querySelector("main") ??
    document.querySelector("[data-framer-page-wrapper]") ??
    document.body

  // Framer wraps page content in a few nested full-width divs. Descend while there
  // is a single meaningful child so we reach the level where bands live.
  let container: Element = root
  for (let depth = 0; depth < 6; depth++) {
    const kids = Array.from(container.children).filter((c) => {
      const r = c.getBoundingClientRect()
      return r.height > 40 && r.width > 40
    })
    if (kids.length === 1 && kids[0]) container = kids[0]
    else break
  }

  // <main> is a wrapper (a real site returned one 15000px "Main"), so use its children instead.
  const semantic = Array.from(document.querySelectorAll("section, header, footer, [data-framer-name]")).filter((e) => e.tagName !== "MAIN")
  const bands = [...Array.from(container.children), ...Array.from(document.querySelectorAll("main")).flatMap((m) => Array.from(m.children))]
  const seen = new Set<Element>()
  const candidates: Element[] = []
  for (const el of [...semantic, ...bands]) {
    if (seen.has(el)) continue
    seen.add(el)
    candidates.push(el)
  }

  const isBand = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.height >= minHeight && r.width >= vw * minWidthRatio
  }

  const bandCandidates = candidates.filter(isBand)
  // Remove nested: keep an element only if no other kept element contains it.
  const kept: Element[] = []
  for (const el of bandCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
    if (kept.some((k) => k !== el && k.contains(el))) continue
    // If el contains an already kept element, prefer the inner (more specific) ones.
    if (kept.some((k) => el.contains(k))) continue
    kept.push(el)
  }

  const scrollY = window.scrollY
  return kept.slice(0, max).map((el, index) => {
    const r = el.getBoundingClientRect()
    const textChars = (el.textContent ?? "").trim().length
    const images = el.querySelectorAll("img, video, svg, picture").length
    const name =
      el.getAttribute("data-framer-name") ??
      el.getAttribute("aria-label") ??
      el.id ??
      null
    return {
      index,
      name: name && name.length > 0 ? name : null,
      tag: el.tagName.toLowerCase(),
      rect: { x: Math.round(r.left), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
      score: Math.round(r.height / 100 + Math.min(images, 6) * 2 + Math.min(textChars, 600) / 100),
      textChars,
      images,
    }
  })
}
