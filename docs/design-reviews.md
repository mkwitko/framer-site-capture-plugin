# Design reviews

## Painel do plugin — 2026-10-10 (mock mode, Chrome 143, fora do Framer)

Processo: `/impeccable shape` (brief em `docs/specs/plugin-ui.md`), frontend-design, build code-led, inspeção em lote (6 estados × 320×520 e 420×640 × claro/escuro = 24 capturas), `impeccable detect --json packages/plugin/src` = `[]`, axe-core WCAG 2.0 A/AA.

| Estado | Antes | Problemas | Severidade | Correção | Depois | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Todos | input file visível "Escolher arquivos" no topo | `hidden` sobrescrito por framer.css | alta | `style=display:none` | `design-reviews/ready-320x520.png` | ✔ |
| Todos | botões/inputs sem fundo, tema escuro ignorado | variáveis `--framer-color-*` vêm do host; ausentes fora do Framer | alta (só QA) | `mock-theme.css` só em `?mock` | `compose-420x640-dark.png` | ✔ |
| capture-failed | bloco de erro sobreposto pelo rodapé sticky | conteúdo maior que o painel | alta | região de scroll + rodapé fixo com divisor | `capture-failed-320x520-dark.png` | ✔ |
| unpublished | "Capture site" desabilitado + "Upload" duplicado | ação primária errada | média | Upload vira primária; sem duplicata | `unpublished-320x520.png` | ✔ |
| compose 320 | "Desktop + Mobile" quebra em 2 linhas no segmented | label longo | baixa | preset renomeado "Devices" | `compose-320x520.png` | ✔ |
| ready/unpublished | contraste `.muted` 2,8:1 (axe) | text-tertiary | média | text-secondary | — | ✔ |
| compose | região de miniaturas rolável sem foco (axe) | container sem tabindex | média | `role=region tabIndex=0` quando não selecionável | — | ✔ |
| todos | `.framer-button-primary` branco sobre `#09f` ≈ 2,9:1 (axe) | tint do próprio Framer | registrada | mantido: padrão do host; não sobrescrever a identidade do Framer | — | BLOCKED (decisão do host) |

### Scorecard (qualitativo, 0–5)
Clareza 4,5 · Hierarquia 4,5 · Tipografia 4 (Inter do host) · Espaçamento 4 · Interações 4 (slide-in das miniaturas, preview < 100 ms) · Consistência 4,5 · Acessibilidade 4 · Responsivo 4,5 · Performance percebida 4,5 · Refinamento 3,5 → **≈ 4,2**. Abaixo da meta 4,5: falta polish final dentro do Framer real (Gate 9 BLOCKED) e um estado vazio para "sem seções".

### Pendências
- Gate 9: validar dentro do editor (tema real, variáveis reais, `addImage`).
- Custom color: `input[type=color]` do Framer fica muito pequeno; avaliar swatch maior.
- Estado "quota esgotada" e "offline" só testados por tipo (ERROR_COPY), sem screenshot.
