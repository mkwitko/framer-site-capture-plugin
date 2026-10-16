# Arquitetura

```
Framer editor ──iframe──▶ packages/plugin (React)
                              │ readProject()  ← @framer/plugin 5.x
                              │ POST /session, POST /capture (Bearer token)
                              ▼
                    packages/worker (Cloudflare Worker)
                      url-guard → preflight → Browser Run (puppeteer) + request interception
                      capture-core scripts (freeze motion, settle, detectSections)
                              │ JSON { fullPage, sections[] } (PNG base64)
                              ▼
                    packages/composer (Canvas 2D) → preview + renderPng (1x/2x/3x) → PNG / ZIP (fflate) / framer.addImage
```

Contratos: `packages/contracts` (Zod). Sem banco, sem R2, sem fila no MVP (ADR-0002). Licenças: futuro `/license/*` + webhook do provedor (Spike G), KV para instâncias ativadas.

## Decisões
ADR-0001 pacote `@framer/plugin` · ADR-0002 segurança/infra de captura · ADR-0003 Watch precisa de detecção server-side · ADR-0004 composer Canvas 2D.

## Limites conhecidos
- Browser Run free: 10 min/dia, 3 concorrentes, 1 instância nova / 20 s, timeout 60 s.
- Plugin roda em iframe: sem acesso ao canvas renderizado do Framer; captura só do site publicado.
