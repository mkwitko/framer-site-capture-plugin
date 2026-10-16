# DESIGN.md — SitePromo Showcase (plugin panel)

Fonte da verdade visual: **o mundo do Framer** (`@framer/plugin/styles/framer.css`). O painel não inventa paleta nem tipografia; a única cor "nossa" é a do site do usuário dentro do preview.

## Direção
Precision · Simplicity · Confidence · Craft. O preview é o produto; o painel é uma moldura quieta. Uma ação primária por estado. Três momentos no mesmo lugar (Ready → Capturing → Compose), sem wizard.

## Tokens (do host)
Cores: `--framer-color-bg/-secondary/-tertiary`, `-text/-secondary/-tertiary`, `-tint/-tint-dark`, `-divider`. Fonte: `--framer-font-family` (Inter), 12 px/1.5, peso 500; nome do projeto 13 px/600; metadados 11 px.
Raios: 10 (cards) · 8 (preview, segmented, inputs) · 6 (miniaturas, segmentos) · 50 % (swatches).
Espaço: 12 px entre blocos, 6 px dentro de grupos, padding do painel 12 px.
Sombras: preview `0 1px 2px rgba(0,0,0,.08)` + hairline `0 0 0 1px divider`; segmento ativo `0 1px 2px rgba(0,0,0,.08)`.
Motion: só a entrada das miniaturas (`slide-in` 240 ms, `cubic-bezier(.2,.8,.2,1)`), desligada em `prefers-reduced-motion`.

## Componentes
`Preview` (canvas 16:10, DPR ≤ 2) · `Thumbs` (faixa horizontal, `aria-pressed` quando selecionável) · segmented radiogroup de presets · campos Title/Subtitle · swatches radiogroup + `input[type=color]` · bloco de erro (texto + até 2 ações) · rodapé fixo com divisor (primária à direita).

## Estados cobertos
loading · ready · unpublished · capturing (cancelável) · compose · capture-failed · no-permission · notice de export. Copy em `ERROR_COPY` (App.tsx).

## Imagens geradas (camada B)
Ver `packages/composer`: fundo da paleta do projeto com gradiente ≤ 3,5 %, título legível (≥ 4,5:1), molduras de navegador/telefone, sombra em duas camadas, recortes cover-top. Presets: Hero, Devices, Sections.

## Decisões
- Não sobrescrever o tint do Framer mesmo com contraste 2,9:1 (identidade do host).
- Mock theme só em `?mock=`; nunca no bundle de produção do Framer.
