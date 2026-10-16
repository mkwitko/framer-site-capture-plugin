import { type ComposeInput, compose } from "@sitepromo/composer"
import { useEffect, useRef } from "react"

/** Live composition. Draws at device pixel ratio into a canvas sized by CSS (16:10). */
export function Preview({ input }: { input: ComposeInput }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = c.clientWidth
    const scale = (cssW * dpr) / input.width
    c.width = Math.round(input.width * scale)
    c.height = Math.round(input.height * scale)
    const ctx = c.getContext("2d")
    if (ctx) compose(ctx, input, scale)
  }, [input])
  return <canvas ref={ref} className="preview" role="img" aria-label={`${input.preset} preview`} />
}
