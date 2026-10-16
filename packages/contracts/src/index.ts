import { z } from "zod"

export const Viewport = z.enum(["desktop", "mobile"])
export type Viewport = z.infer<typeof Viewport>

export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
}

export const Rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Rect = z.infer<typeof Rect>

/** A detected section of a published page (output of capture-core detectSections). */
export const Section = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().nullable(),
  tag: z.string(),
  rect: Rect,
  score: z.number(),
})
export type Section = z.infer<typeof Section>

export const CaptureRequest = z.object({
  url: z.string().url(),
  viewports: z.array(Viewport).min(1).default(["desktop", "mobile"]),
  fullPage: z.boolean().default(true),
  sections: z.boolean().default(true),
})
export type CaptureRequest = z.infer<typeof CaptureRequest>

export const ProjectPalette = z.object({
  background: z.string(),
  foreground: z.string(),
  accent: z.string().optional(),
  fontFamily: z.string().optional(),
})
export type ProjectPalette = z.infer<typeof ProjectPalette>
