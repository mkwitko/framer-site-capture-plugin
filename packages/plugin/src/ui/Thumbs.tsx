import { useEffect, useRef } from "react"
import type { Shot } from "../state/model.ts"

function Thumb({ shot, selected, onToggle }: { shot: Shot; selected: boolean; onToggle?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = 96, h = 60
    c.width = w * 2
    c.height = h * 2
    const ctx = c.getContext("2d")
    if (!ctx) return
    const s = c.width / shot.bitmap.width
    ctx.drawImage(shot.bitmap, 0, 0, shot.bitmap.width, Math.min(shot.bitmap.height, c.height / s), 0, 0, c.width, Math.min(c.height, shot.bitmap.height * s))
  }, [shot])
  const label = shot.name ?? (shot.kind === "full" ? `${shot.viewport} full page` : `${shot.viewport} section`)
  return (
    <button type="button" className="thumb" aria-pressed={onToggle ? selected : undefined} onClick={onToggle} disabled={!onToggle}>
      <canvas ref={ref} aria-hidden="true" />
      <span className="thumb-label">{label}</span>
    </button>
  )
}

export function Thumbs({ shots, picked, onToggle, pickable }: { shots: Shot[]; picked: string[]; onToggle: (id: string) => void; pickable: boolean }) {
  if (shots.length === 0) return null
  return (
    <div className="thumbs" role={pickable ? "group" : "region"} tabIndex={pickable ? undefined : 0} aria-label={pickable ? "Sections to include" : "Captured images"}>
      {shots.map((s) => (
        <Thumb key={s.id} shot={s} selected={picked.includes(s.id)} {...(pickable && s.kind === "section" ? { onToggle: () => onToggle(s.id) } : {})} />
      ))}
    </div>
  )
}
