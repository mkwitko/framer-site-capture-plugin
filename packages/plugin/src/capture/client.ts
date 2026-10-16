import { CaptureRequest, type Viewport } from "@sitepromo/contracts"
import type { Shot } from "../state/model.ts"

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined

interface WorkerSection { index: number; name: string | null; png: string }
interface WorkerResult { viewport: Viewport; fullPage: string; sections: WorkerSection[] }

export class CaptureHttpError extends Error {
  constructor(readonly status: number, readonly reason?: string) { super(`capture ${status}`) }
}

async function toBitmap(b64: string): Promise<ImageBitmap> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return createImageBitmap(new Blob([bytes], { type: "image/png" }))
}

let session: { token: string; expiresAt: number } | null = null
async function token(signal: AbortSignal, force = false): Promise<string> {
  if (session && !force && session.expiresAt > Date.now() + 60_000) return session.token
  const r = await fetch(`${WORKER_URL}/session`, { method: "POST", signal })
  if (!r.ok) throw new CaptureHttpError(r.status)
  const j = (await r.json()) as { token: string; expiresIn: number }
  session = { token: j.token, expiresAt: Date.now() + j.expiresIn * 1000 }
  return session.token
}

async function postCapture(body: unknown, signal: AbortSignal, retry = true): Promise<Response> {
  const res = await fetch(`${WORKER_URL}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await token(signal, !retry)}` },
    body: JSON.stringify(body),
    signal,
  })
  if (res.status === 401 && retry) return postCapture(body, signal, false)
  return res
}

/**
 * Captures one URL through the Worker. Yields shots as they are decoded so the UI can show
 * them progressively; the Worker itself answers once per request (sync), so progress is per viewport.
 */
export async function* capture(url: string, viewports: Viewport[], signal: AbortSignal): AsyncGenerator<Shot> {
  if (!WORKER_URL) throw new Error("VITE_WORKER_URL is not configured")
  for (const viewport of viewports) {
    const body = CaptureRequest.parse({ url, viewports: [viewport] })
    const res = await postCapture(body, signal)
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      throw new CaptureHttpError(res.status, j.error)
    }
    const { results } = (await res.json()) as { results: WorkerResult[] }
    for (const r of results) {
      yield { id: `${r.viewport}-full`, kind: "full", viewport: r.viewport, name: null, bitmap: await toBitmap(r.fullPage) }
      for (const s of r.sections) yield { id: `${r.viewport}-s${s.index}`, kind: "section", viewport: r.viewport, name: s.name, bitmap: await toBitmap(s.png) }
    }
  }
}

/** Local file → Shot (manual fallback). */
export async function shotFromFile(file: File, viewport: Viewport): Promise<Shot> {
  return { id: `upload-${crypto.randomUUID()}`, kind: "full", viewport, name: file.name, bitmap: await createImageBitmap(file) }
}
