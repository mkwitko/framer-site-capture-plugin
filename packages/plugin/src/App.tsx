import { type ComposeInput, type Img, PRESET_LIST, type PresetId } from "@sitepromo/composer"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { CaptureHttpError, shotFromFile } from "./capture/client.ts"
import { mockCapture, mockProject, mockState } from "./capture/mock.ts"
import { exportPng } from "./export.ts"
import type { ProjectSnapshot } from "./framer/project.ts"
import { type CaptureError, DEFAULT_SETTINGS, type Phase, type Settings, type Shot, classifyError, firstPage } from "./state/model.ts"
import { Preview } from "./ui/Preview.tsx"
import { Thumbs } from "./ui/Thumbs.tsx"
import "./App.css"

const inFramer = !mockState
// @framer/plugin only loads inside Framer: outside the editor its module never resolves the handshake.
const LiveApp = lazy(() => import("./framer/LiveApp.tsx"))
if (!inFramer) import("./mock-theme.css")

export interface PanelApi {
  canInsert: boolean
  readProject: () => Promise<ProjectSnapshot>
  capture: (url: string, signal: AbortSignal) => AsyncGenerator<Shot>
  insert: (file: File, name: string) => Promise<void>
}

const ERROR_COPY: Record<CaptureError, { text: string; retry: boolean }> = {
  not_published: { text: "This site isn't published yet. Publish it, or upload a screenshot.", retry: false },
  failed: { text: "We couldn't capture this site. Try again or upload a screenshot.", retry: true },
  quota: { text: "Daily capture limit reached. Try again tomorrow, or upload a screenshot.", retry: false },
  offline: { text: "You're offline. Reconnect to capture.", retry: true },
  rejected: { text: "This URL can't be captured. Only published Framer sites over https are supported.", retry: false },
}

export function App() {
  if (inFramer) return <Suspense fallback={null}><LiveApp /></Suspense>
  const mockApi: PanelApi = {
    canInsert: mockState !== "no-permission",
    readProject: () => Promise.resolve(mockProject(mockState !== "unpublished")),
    capture: (_url, signal) => mockCapture("demo", signal),
    insert: async () => {},
  }
  return <Panel api={mockApi} />
}

export function Panel({ api }: { api: PanelApi }) {
  const canInsert = api.canInsert
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, background: "#111113" })
  const [page, setPage] = useState("/")
  const [busy, setBusy] = useState<"export" | "canvas" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const shotsRef = useRef<Shot[]>([]) // bitmaps owned by the current phase, closed on recapture/unmount

  // Load project
  useEffect(() => {
    api.readProject()
      .then((project) => {
        setPage(firstPage(project))
        const bg = project.colors[0]?.light ?? "#111113"
        setSettings((s) => ({ ...s, background: bg }))
        setPhase({ kind: "ready", project, ...(project.publishedUrl ? {} : { error: "not_published" as const }) })
      })
      .catch((e: unknown) => setPhase({ kind: "fatal", message: e instanceof Error ? e.message : String(e) }))
  }, [])

  const startCapture = useCallback(async (project: ProjectSnapshot) => {
    if (!project.publishedUrl) return
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    for (const s of shotsRef.current) s.bitmap.close() // previous capture no longer referenced
    const shots: Shot[] = []
    shotsRef.current = shots
    setPhase({ kind: "capturing", project, shots: [], viewportsDone: 0 })
    const url = new URL(page, project.publishedUrl).href
    try {
      const gen = api.capture(url, ac.signal)
      for await (const shot of gen) {
        shots.push(shot)
        setPhase({ kind: "capturing", project, shots: [...shots], viewportsDone: shots.filter((s) => s.kind === "full").length })
      }
      setPhase({ kind: "compose", project, shots })
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase(shots.length ? { kind: "compose", project, shots } : { kind: "ready", project })
        return
      }
      const err = e instanceof CaptureHttpError ? classifyError(e.status, e.reason) : navigator.onLine ? "failed" : "offline"
      setPhase(shots.length ? { kind: "compose", project, shots, error: err } : { kind: "ready", project, error: err })
    }
  }, [page, api])

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    e.target.value = "" // allow re-picking the same file
    if (!files?.length || phase.kind === "capturing") return
    const project = "project" in phase ? phase.project : null
    const existing = phase.kind === "compose" ? phase.shots : []
    try {
      const picked = [...files].filter((f) => f.size <= 25 * 1024 * 1024)
      const added = await Promise.all(picked.map((f, i) => shotFromFile(f, i === 0 && existing.some((s) => s.viewport === "desktop") ? "mobile" : "desktop")))
      if (!added.length) throw new Error("too_large")
      shotsRef.current = [...existing, ...added]
      setPhase({ kind: "compose", project, shots: shotsRef.current })
    } catch {
      setNotice("That image couldn't be read. Use a PNG or JPG under 25 MB.")
    }
  }

  // Abort in-flight capture and release bitmaps on unmount.
  useEffect(() => () => { abort.current?.abort(); for (const s of shotsRef.current) s.bitmap.close() }, [])

  // Automatically pick the first sections when they arrive
  const shots = phase.kind === "compose" || phase.kind === "capturing" ? phase.shots : []
  const sections = shots.filter((s) => s.kind === "section" && s.viewport === "desktop")
  useEffect(() => {
    if (settings.picked.length === 0 && sections.length) setSettings((s) => ({ ...s, picked: sections.slice(0, 3).map((x) => x.id) }))
  }, [sections.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const project = "project" in phase ? phase.project : null
  const input: ComposeInput | null = useMemo(() => {
    if (!shots.length) return null
    const img = (s?: Shot): Img | undefined => (s ? (s.bitmap as unknown as Img) : undefined)
    const desktop = img(shots.find((s) => s.kind === "full" && s.viewport === "desktop") ?? shots[0])
    const mobile = img(shots.find((s) => s.kind === "full" && s.viewport === "mobile"))
    const picked = settings.picked.map((id) => shots.find((s) => s.id === id)).filter(Boolean).map((s) => img(s as Shot) as Img)
    return {
      preset: settings.preset,
      width: 1600,
      height: 1000,
      images: { ...(desktop ? { desktop } : {}), ...(mobile ? { mobile } : {}), sections: picked },
      palette: { background: settings.background },
      ...(settings.title ? { title: settings.title } : {}),
      ...(settings.subtitle ? { subtitle: settings.subtitle } : {}),
      ...(project?.fonts[0]?.family ? { fontFamily: project.fonts[0].family } : {}),
    }
  }, [shots, settings, project])

  const presetAvailable = (id: PresetId) => {
    const needs = PRESET_LIST.find((p) => p.id === id)?.needs ?? []
    return needs.every((n) => (n === "sections" ? sections.length > 0 : shots.some((s) => s.kind === "full" && s.viewport === n)))
  }

  const doExport = async (kind: "download" | "canvas") => {
    if (!input) return
    setBusy(kind === "canvas" ? "canvas" : "export")
    setNotice(null)
    try {
      await exportPng(input, 1, kind, (file) => api.insert(file, `SitePromo ${input.preset}`))
      setNotice(kind === "canvas" ? "Inserted on canvas" : "PNG saved")
    } catch {
      setNotice("The export didn't finish correctly. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const palette = project?.colors.slice(0, 6) ?? []

  if (phase.kind === "loading") return <main className="panel"><p className="muted" role="status">Reading project…</p></main>
  if (phase.kind === "fatal") return <main className="panel"><p role="alert">Couldn't read this project. {phase.message}</p></main>

  const error = "error" in phase ? phase.error : undefined
  const capturing = phase.kind === "capturing"

  return (
    <main className="panel">
      <div className="scroll">
      <input ref={fileInput} type="file" accept="image/png,image/jpeg" multiple style={{ display: "none" }} onChange={onUpload} />

      {input ? (
        <Preview input={input} />
      ) : (
        <section className="project" aria-live="polite">
          <h1 className="project-name">{project?.name}</h1>
          <p className="muted">{project?.publishedUrl?.replace(/^https?:\/\//, "") ?? "Not published"}</p>
          {project && project.pages.length > 1 && project.publishedUrl && (
            <label className="field">
              <span>Page</span>
              <select value={page} onChange={(e) => setPage(e.target.value)} disabled={capturing}>
                {project.pages.filter((p) => !p.draft).map((p) => <option key={p.path} value={p.path}>{p.path}{p.collectionId ? " (CMS)" : ""}</option>)}
              </select>
            </label>
          )}
        </section>
      )}

      {capturing && (
        <p className="muted" role="status" aria-live="polite">
          Capturing {phase.viewportsDone === 0 ? "desktop" : "mobile"}… {phase.shots.length} image{phase.shots.length === 1 ? "" : "s"} so far
        </p>
      )}

      <Thumbs shots={shots} picked={settings.picked} pickable={settings.preset === "sections"} onToggle={(id) => setSettings((s) => ({ ...s, picked: s.picked.includes(id) ? s.picked.filter((x) => x !== id) : [...s.picked, id].slice(-4) }))} />

      {error && (
        <div className="error" role="alert">
          <p>{ERROR_COPY[error].text}</p>
          <div className="row">
            {ERROR_COPY[error].retry && project && <button type="button" onClick={() => startCapture(project)}>Try again</button>}
            {error !== "not_published" && <button type="button" disabled={capturing} onClick={() => fileInput.current?.click()}>Upload screenshot</button>}
          </div>
        </div>
      )}

      {input && (
        <>
          <div className="segmented" role="radiogroup" aria-label="Layout">
            {PRESET_LIST.map((p) => (
              <button type="button" key={p.id} role="radio" aria-checked={settings.preset === p.id} disabled={!presetAvailable(p.id)} onClick={() => setSettings((s) => ({ ...s, preset: p.id }))}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="fields">
            <input type="text" placeholder="Title (optional)" value={settings.title} maxLength={80} onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))} aria-label="Title" />
            <input type="text" placeholder="Subtitle" value={settings.subtitle} maxLength={120} onChange={(e) => setSettings((s) => ({ ...s, subtitle: e.target.value }))} aria-label="Subtitle" />
            <div className="swatches" role="radiogroup" aria-label="Background">
              {[...new Map(palette.map((c) => [c.light, c])).values()].map((c) => (
                <button type="button" key={c.light} role="radio" aria-checked={settings.background === c.light} aria-label={c.name} title={c.name} style={{ background: c.light }} onClick={() => setSettings((s) => ({ ...s, background: c.light }))} />
              ))}
              <input type="color" value={settings.background.length === 7 ? settings.background : "#111113"} aria-label="Custom background" onChange={(e) => setSettings((s) => ({ ...s, background: e.target.value }))} />
            </div>
          </div>
        </>
      )}

      </div>
      <footer className="actions">
        {notice && <p className="muted" role="status">{notice}</p>}
        {!input && !capturing && project?.publishedUrl && (
          <button type="button" className="framer-button-primary" onClick={() => startCapture(project)}>Capture site</button>
        )}
        {!input && !capturing && !project?.publishedUrl && <button type="button" className="framer-button-primary" onClick={() => fileInput.current?.click()}>Upload screenshot</button>}
        {capturing && <button type="button" onClick={() => abort.current?.abort()}>Cancel</button>}
        {input && !capturing && (
          <div className="row">
            <button type="button" onClick={() => doExport("download")} disabled={busy !== null}>{busy === "export" ? "Exporting…" : "Export PNG"}</button>
            {canInsert ? (
              <button type="button" className="framer-button-primary" onClick={() => doExport("canvas")} disabled={busy !== null}>{busy === "canvas" ? "Inserting…" : "Insert on canvas"}</button>
            ) : null}
          </div>
        )}
        {input && !capturing && project?.publishedUrl && (
          <button type="button" className="link" onClick={() => startCapture(project)}>Capture again</button>
        )}
      </footer>
    </main>
  )
}
