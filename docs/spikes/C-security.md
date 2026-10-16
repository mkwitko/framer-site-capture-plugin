# Spike C — Segurança do mecanismo de captura

Data: 2026-10-10 · Resultado: **PASS (camada de validação, testes locais)** · Produção: **PENDENTE** (sem conta Cloudflare nesta sessão)

## O que foi construído

| Arquivo | Função |
| --- | --- |
| `packages/worker/src/url-guard.ts` | `parseTargetUrl` (estrutura), `isPrivateIp` (IPv4/IPv6), `assertPublicHost` (DoH, todas as respostas A/AAAA), `createRequestFilter` (por requisição do navegador), `looksLikeFramerHtml` |
| `packages/worker/src/preflight.ts` | Redirects manuais (≤ 3 saltos), cada salto revalidado; domínio próprio exige `<meta name="generator" content="Framer…">` |
| `packages/worker/src/token.ts` | Token HMAC-SHA256 de sessão com expiração (1 h), sem banco |
| `packages/worker/src/capture.ts` | `page.setRequestInterception(true)`: toda requisição (inclusive subrecursos, redirects, websockets) passa pelo mesmo guard; abort se reprovada |
| `packages/worker/src/index.ts` | Kill switch (`CAPTURE_ENABLED=0`), rate limit por IP e por sessão (binding Rate Limiting), orçamento diário de ms de navegador (KV), CORS restrito, logs estruturados sem URL completa |

## Defesa em profundidade (mapa para a lista do prompt)

| # | Controle | Estado |
| --- | --- | --- |
| 1 | HTTPS obrigatório | Implementado + testado |
| 2 | Hosts/portas | Porta só 443; `*.framer.app/.website/.ai/.media` liberados; domínio próprio só com generator meta | Implementado + testado |
| 3 | Guardrails nativos do Browser Run | Não verificável sem conta; o guard não depende deles |
| 4 | Verificação de cada requisição do navegador | Implementado (`createRequestFilter` + interception); não executado em Browser Run real |
| 5 | Redirects revalidados | Implementado + testado (preflight) e em runtime (interception cobre redirects de subrecursos) |
| 6 | Redes privadas/metadata | IPv4 (0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 192.0.0/24, 198.18/15, ≥224/4) e IPv6 (::, ::1, fc00::/7, fe80::/10, fec0::/10, ff00::/8, ::ffff:v4, 64:ff9b::/96, 2002::/16, 2001:db8::/32) | Testado |
| 7 | Validação estrutural | Sem credenciais, sem IP literal (inclui decimal/hex), sem `.local/.internal/.localhost/.lan/.onion`, ≤ 2048 chars, hash removido | Testado |
| 8–9 | Limites por operação/concorrência | ≤ 2 viewports, ≤ 6 seções, seção ≤ 4000 px, nav timeout 25 s, 1 navegador por job | Implementado |
| 10–11 | Quota global e por credencial | KV `browser-ms:<dia>` (padrão 8 min) + rate limit por `sid` | Implementado, não exercitado |
| 12 | Cache | Não implementado (ADR: só quando houver custo medido) |
| 13–14 | Tokens assinados com expiração | Implementado + testado |
| 15 | Rate limiting | Binding `CAPTURE_RL` 5/min por chave | Configurado, não exercitado |
| 16 | Anti-bot (Turnstile) | Não implementado; token de sessão é anônimo. Adicionar Turnstile antes de publicar o endpoint (precisa de site key do dono) |
| 17 | Cancelamento | Cliente aborta a requisição; o Worker fecha o navegador no `finally`. Cancelamento real de job em andamento não existe (síncrono) |
| 18 | Kill switch | `CAPTURE_ENABLED` var |
| 19 | Logs sem dados sensíveis | Só hostname, razão e tempos |

## Testes executados

```
pnpm vitest run packages/worker
Test Files 3 passed · Tests 79 passed
```

Casos reprovados antes do navegador: http, ftp, file, javascript, credenciais na URL, portas 80/8443, `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `[::1]`, `[fd00::1]`, IP decimal `2130706433`, hex `0x7f000001`, `localhost`, `*.localhost`, `*.internal`, `*.local`, `*.lan`, `*.onion`, host sem ponto, URL > 2048; DNS com qualquer resposta privada (inclusive AAAA loopback ao lado de A pública); redirect para http/IP/host privado; cadeia > 3 redirects; domínio próprio sem generator meta; upstream não-2xx.

## Limitações honestas

- DNS rebinding entre a resolução DoH e a conexão do Chromium continua teoricamente possível; a interceptação por requisição reduz a janela, mas não a elimina (o navegador resolve por conta própria). Mitigação adicional: Browser Run roda na rede da Cloudflare, não na nossa; documentar comportamento oficial quando houver conta.
- `generator=Framer` não prova propriedade do domínio; serve só para limitar o endpoint a sites Framer. Capturas privadas estão fora do MVP.
- Token de sessão não autentica ninguém; limita abuso por volume, não por identidade.
- Nada foi exercitado contra o Browser Run real.

## Próximas ações

1. Dono: criar conta Workers (free), `wrangler secret put SESSION_SECRET`, KV `QUOTA`, Turnstile keys.
2. Rodar `wrangler dev --remote` e repetir os casos proibidos contra o endpoint real (`tests/integration/worker-ssrf.sh`, a criar).
3. Só então expor o endpoint ao plugin.
