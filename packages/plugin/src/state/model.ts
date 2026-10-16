import type { PresetId } from "@sitepromo/composer"
import type { Viewport } from "@sitepromo/contracts"
import type { ProjectSnapshot } from "../framer/project.ts"

/** One received screenshot, already decoded for Canvas. */
export interface Shot {
  id: string
  kind: "full" | "section"
  viewport: Viewport
  name: string | null
  bitmap: ImageBitmap
}

export type CaptureError = "not_published" | "failed" | "quota" | "offline" | "rejected"

export type Phase =
  | { kind: "loading" }
  | { kind: "ready"; project: ProjectSnapshot; error?: CaptureError }
  | { kind: "capturing"; project: ProjectSnapshot; shots: Shot[]; viewportsDone: number }
  | { kind: "compose"; project: ProjectSnapshot | null; shots: Shot[]; error?: CaptureError }
  | { kind: "fatal"; message: string }

export interface Settings {
  preset: PresetId
  title: string
  subtitle: string
  background: string
  /** ids of section shots picked for the Sections preset (max 4) */
  picked: string[]
}

export const DEFAULT_SETTINGS: Omit<Settings, "background"> = { preset: "hero", title: "", subtitle: "", picked: [] }

export const firstPage = (p: ProjectSnapshot) => p.pages.find((x) => !x.draft && !x.collectionId)?.path ?? "/"

/** Map a Worker/HTTP failure to a user-facing error. */
export function classifyError(status: number | null, reason?: string): CaptureError {
  if (status === null) return "offline"
  if (status === 429) return "quota"
  if (status === 422 || reason === "url_rejected") return "rejected"
  return "failed"
}
