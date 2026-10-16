# ADR-0002 — Captura via Cloudflare Worker + Browser Run com guard por requisição; sem R2/KV cache no MVP

Data: 2026-10-10 · Status: aceito (produção pendente de conta)

**Contexto.** O endpoint de captura é a única superfície pública que navega para URLs de terceiros (SSRF). Free tier: 10 min/dia de navegador, 3 concorrentes, timeout 60 s.

**Decisão.**
1. Toda URL passa por `parseTargetUrl` → `preflight` (redirects manuais revalidados, generator meta para domínio próprio) → DoH com rejeição de qualquer resposta privada → interceptação de **cada** requisição do navegador com o mesmo guard.
2. Token de sessão HMAC (1 h) + rate limit por IP e por sessão + orçamento diário de ms de navegador em KV + kill switch.
3. Resposta síncrona com PNGs em base64. Sem R2, sem cache, sem fila: não há custo medido que justifique. Revisitar quando o consumo real for conhecido (Spike F produção).
4. Turnstile antes de expor publicamente (precisa de chaves do dono).

**Rejeitado.** Allowlist de hostname como única defesa; validação DNS única sem interceptação; endpoint sem token.
