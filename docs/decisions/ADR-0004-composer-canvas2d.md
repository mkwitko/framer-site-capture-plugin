# ADR-0004 — Composer em Canvas 2D puro, sem dependências

Data: 2026-10-10 · Status: aceito

**Decisão.** `packages/composer` desenha com Canvas 2D/OffscreenCanvas e TypeScript, sem bibliotecas (sem fabric/konva/satori), sem IA. Mesma função para preview e export (`scale`). Fontes do projeto só via `FontFace` registrada pelo chamador.

**Por quê.** Zero bytes extras no bundle do plugin, determinismo testável com pixelmatch, reutilizável fora do Framer. SVG foi descartado por complicar export rasterizado com fontes.
