# Spec — Plugin panel (SitePromo Showcase)

Shape brief (Impeccable `shape`, 2026-10-10). Mode: **Operate** (the user is mid-task inside Framer). Visual authority: Framer's plugin world (`framer.css` tokens, Inter, 12 px base) — inherited, not reinvented. Assumptions marked [assumido]; no interview was possible in this autonomous session.

## Problema
A designer has a published Framer site and needs portfolio images now. Today: screenshots by hand, Figma mockups, 30–60 min.

## Escopo
One panel, three stacked moments, no wizard:
1. **Ready** — project name + published URL detected, pages list (first page preselected), primary action "Capture site".
2. **Capturing / Captured** — thumbnails appear as they arrive (desktop, mobile, sections); cancel always available.
3. **Compose** — preview on top (always visible), preset switch (Hero · Desktop + Mobile · Sections), title/subtitle inline fields, background swatches from the project palette, actions "Insert on canvas" (primary when allowed) and "Export PNG".

## Fora de escopo
Accounts, Pro checkout (only a contextual upgrade row), advanced editor, video, multiple projects.

## Requisitos
- Works at 320 px wide; preview keeps 16:10 and never pushes actions out of view (actions pinned at bottom).
- Progressive capture with `AbortController`; cancel keeps already received images.
- Manual upload fallback (PNG/JPG) whenever capture fails or the site is unpublished.
- Preview = export: same `compose()` call.
- Insert on canvas only if `useIsAllowedTo("addImage")`; otherwise Export is primary.
- Light/dark follow `data-framer-theme`.
- Keyboard: Tab order follows reading order; preset switch is a radiogroup; Enter on primary.

## Contratos
`ProjectSnapshot` (plugin/framer/project.ts), `CaptureRequest` → Worker `/capture` response `{ results: CaptureResult[] }`, `ComposeInput` (composer).

## Casos de erro (estado → copy → saída)
- Not published → "This site isn't published yet. Publish it, or upload a screenshot." → Upload.
- Capture failed (502/url_rejected) → "We couldn't capture this site. Try again or upload a screenshot." → Retry / Upload.
- Quota/rate limit (429) → "Daily capture limit reached. Try again tomorrow, or upload a screenshot." → Upload.
- Offline → "You're offline. Reconnect to capture." → Retry.
- No sections → "No sections detected. Hero and Desktop + Mobile still work." (Sections preset disabled).
- Pro feature (2x/3x/ZIP) → inline row under the export control: "2x and ZIP are part of Pro." → Learn more.
- Export failed (pngSize mismatch) → "The export didn't finish correctly. Try again." Never save a broken file.

## Critérios de aceitação
- New user: open → capture → export in < 60 s on a published site (manual E2E in Framer).
- All states above have a screenshot in `docs/design-reviews.md` at 320×480 and 420×640.
- `impeccable detect` and axe show no critical findings.

## Testes
Unit: state reducer, upload fallback, export guard. Visual: Playwright screenshots of every state in mock mode (`?mock=<state>`). Real: manual in Framer.

## Definition of Done
Spec items ✔, Gates 1–8 ✔, Gate 9 (real Framer) marked BLOCKED with procedure, handoff updated.

## Direction contract
THESIS: the preview is the product; the panel is a quiet frame around a live, beautiful image that updates as you touch it. It refuses the category default of a settings form with a "Generate" button at the end.
FIRST VIEWPORT: at 320×480, the top 60 % is the composition preview (or the project card before capture), the bottom is one row of segmented presets and one primary button. Nothing scrolls until the user asks for more.
SIGNATURE INTERACTION: thumbnails of captured sections slide into a strip as they arrive, each one tappable to re-pick what the Sections preset uses; the preview re-renders in under 100 ms.
PALETTE: Framer tokens only; the only colour on the panel comes from the user's own site inside the preview and the Framer tint on the primary action.
TYPE: Inter via framer.css, 12 px base, 13 px semibold for the project name, 11 px tertiary for metadata; no eyebrows, no caps.
FORM: single column, three stacked moments replacing each other in place; seed key: none (code-led, no comp).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
