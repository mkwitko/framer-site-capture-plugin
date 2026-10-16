# Spike A — Framer Plugin API

Data: 2026-10-10 · Resultado: **BLOCKED (execução dentro do Framer exige o editor real)** · Verificação estática: **PASS**

## Fato novo: pacote correto é `@framer/plugin`

O template oficial atual (`create-framer-plugin@1.5.1`) importa `@framer/plugin` (5.1.0, 2026-09-24), não `framer-plugin` (3.10.3, último stable em 2026-01-28). Os docs anteriores citavam 3.10.3. Decisão: usar `@framer/plugin@^5.1.0` (ADR-0001).

## Verificado nos tipos de `@framer/plugin@5.1.0` (`node_modules/@framer/plugin/dist/*.d.ts`)

| Chamada | Existe | Protegida (permissão) | Observação |
| --- | --- | --- | --- |
| `getProjectInfo()` | ✔ | não | `name`, `id`, `apiVersion1Id` |
| `getPublishInfo()` | ✔ | não | `{ production, staging }`, cada `{ url, currentPageUrl, deploymentTime, optimizationStatus } \| null` — site não publicado = `production: null` |
| `subscribeToPublishInfo(cb)` | ✔ | não | Só enquanto o plugin está aberto (ver ADR-0003 sobre Watch) |
| `getNodesWithType("WebPageNode")` | ✔ | não | `path`, `collectionId` (CMS), `draft` |
| `getColorStyles()` | ✔ | não | `light`, `dark \| null`, `name` |
| `getTextStyles()` | ✔ | não | `name`, `tag`, fonte por breakpoint |
| `getFonts()` | ✔ | não | `family`, `weight`, `style`, `url \| null` (url permite `FontFace` no composer) |
| `getLocales()` | ✔ | não | localização |
| `getImage()` | ✔ | não | imagem da seleção |
| `getSVGForNode` | só na API interna de mensagens | — | não exposto como método público tipado; não contar com ele |
| `addImage(File \| NamedImageAssetInput)` | ✔ | **sim** → `isAllowedTo("addImage")` / `useIsAllowedTo` | aceita `File` diretamente |
| `uploadImage` | ✔ | não | upload sem inserir |
| `getDeployments` / `getChangedPaths` | ✔ apenas Server API (`$framerApiOnly`) | — | não disponíveis no plugin de canvas |

## Código preparado

- `packages/plugin/src/framer/project.ts` — `readProject()` lê tudo acima em paralelo e devolve um snapshot serializável.
- `packages/plugin/src/App.tsx` — painel de diagnóstico: mostra o snapshot, tempo de leitura, `canAddImage`, e botão "Insert test image" (`OffscreenCanvas` → `File` → `addImage`).
- `pnpm --filter @sitepromo/plugin exec tsc --noEmit` ✔ · `vite build` ✔ (210 KB / 63 KB gzip).

## Procedimento manual (dono)

1. `pnpm plugin:dev` (Vite + mkcert; aceitar o certificado local na primeira vez).
2. No Framer: projeto de teste → Plugins → Development → "Open Development Plugin" → `https://localhost:5173`.
3. Casos a registrar (copiar o JSON do painel para este arquivo):
   - projeto **não publicado** (esperado `publishedUrl: null`);
   - projeto publicado em `*.framer.app` e em domínio próprio;
   - projeto com CMS (páginas com `collectionId`), com localização (`locales > 1`), com fontes custom (`fonts[].url`);
   - clicar "Insert test image" com e sem permissão (`canAddImage`).
4. Anotar tempo de leitura e qualquer erro.

## Resultado das execuções reais

_Nenhuma ainda. Não simulado._
