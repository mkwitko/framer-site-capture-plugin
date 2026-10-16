# ADR-0001 — Usar `@framer/plugin` 5.x em vez de `framer-plugin` 3.10.3

Data: 2026-10-10 · Status: aceito

**Contexto.** Os documentos de planejamento citavam `framer-plugin@3.10.3`. O template oficial atual (`create-framer-plugin@1.5.1`) importa `@framer/plugin`, cujo último stable é 5.1.0 (2026-09-24). `framer-plugin` parou em 3.10.3 (jan/2026) com apenas alphas depois.

**Decisão.** Plugin depende de `@framer/plugin@^5.1.0`, React 18, Vite 8, `vite-plugin-framer`.

**Consequências.** API verificada nos tipos (Spike A). `getDeployments`/`getChangedPaths` só existem na Server API. `addImage` exige permissão explícita.
