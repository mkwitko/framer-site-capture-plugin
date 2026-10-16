# Spike E — Exportação

Data: 2026-10-10 · Resultado: **PASS (PNG 1x/2x/3x, ZIP, verificação de integridade)** · Inserção no canvas: **BLOCKED** (exige Framer real; código preparado no plugin)

## Evidências (`tests/visual/render-presets.mjs`, Chrome 143)

| Item | Resultado |
| --- | --- |
| PNG 1x | 1600×1000 exato em 18/18; 163–278 KB; mediana 121 ms |
| PNG 2x | 3200×2000 exato; 472–770 KB; mediana 352 ms |
| PNG 3x | 4800×3000 exato; 916–1456 KB; mediana 820 ms, máx 1,2 s |
| ZIP (fflate 0.8.3, MIT) | 3 PNG@2x por site, ~1,9 MB, mediana 1,1 s, `unzipSync` recupera os 3 arquivos com tamanhos idênticos em 6/6 |
| Heap JS após ZIP | 10 MB (`performance.memory`) |
| Integridade | `pngSize()` lê o IHDR; dimensão divergente = exportação recusada (sem arquivo quebrado silencioso) |
| OffscreenCanvas ausente | `renderPng` cai para `<canvas>` + `toBlob` (caminho implementado, exercitado só via tipos; Chrome tem OffscreenCanvas) |
| Cancelamento | `AbortSignal` checado antes e depois de desenhar; abortar entre etapas evita `convertToBlob` |
| Preview = export | Mesma função `compose` com `scale` diferente; teste de regressão compara o 1x |

## Limitações

- Limite de memória: 3x de 1600×1000 = 57,6 MB de bitmap; não testado em 8 GB RAM com 20 imagens. Regra prática: exportar sequencialmente, liberar blob após download.
- `addImage` do Framer não executado (aceita `File`, confirmado nos tipos de `@framer/plugin` 5.1.0; `uploadImage` é desprotegido, `addImage` é protegido → checar `isAllowedTo("addImage")`).
- Safari/Firefox não testados nesta sessão.

## Próximas ações

1. Plugin: `exportPng` → download via `<a download>`; `insertToCanvas` → `framer.addImage({ image: file, name })` com fallback para download quando sem permissão.
2. Teste real no Framer (procedimento em `docs/spikes/A-framer-api.md`).
