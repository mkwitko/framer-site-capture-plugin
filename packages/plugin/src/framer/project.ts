import { framer } from "@framer/plugin"

/** Everything the plugin needs from the open project, read in one go. Pure data, serialisable. */
export interface ProjectSnapshot {
  name: string
  id: string
  publishedUrl: string | null
  stagingUrl: string | null
  deploymentTime: number | null
  pages: { path: string; collectionId: string | null; draft: boolean }[]
  colors: { name: string; light: string; dark: string | null }[]
  fonts: { family: string; weight: number | null; url: string | null }[]
  textStyles: { name: string; tag: string }[]
  locales: number
  canAddImage: boolean
}

export async function readProject(): Promise<ProjectSnapshot> {
  const [info, publish, pages, colors, fonts, textStyles, locales] = await Promise.all([
    framer.getProjectInfo(),
    framer.getPublishInfo(),
    framer.getNodesWithType("WebPageNode"),
    framer.getColorStyles(),
    framer.getFonts(),
    framer.getTextStyles(),
    framer.getLocales(),
  ])
  return {
    name: info.name,
    id: info.id,
    publishedUrl: publish.production?.url ?? null,
    stagingUrl: publish.staging?.url ?? null,
    deploymentTime: publish.production?.deploymentTime ?? null,
    pages: pages.filter((p) => p.path !== null).map((p) => ({ path: p.path ?? "/", collectionId: p.collectionId, draft: p.draft })),
    colors: colors.map((c) => ({ name: c.name, light: c.light, dark: c.dark })),
    fonts: fonts.map((f) => ({ family: f.family, weight: f.weight, url: f.url })),
    textStyles: textStyles.map((t) => ({ name: t.name, tag: t.tag })),
    locales: locales.length,
    canAddImage: framer.isAllowedTo("addImage"),
  }
}
