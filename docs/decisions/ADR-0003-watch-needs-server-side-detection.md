# ADR-0003 — Watch não pode depender de `subscribeToPublishInfo`

Data: 2026-10-10 · Status: aceito (Watch não aprovado)

**Contexto.** Planejamento anterior sugeria detectar publicações com `subscribeToPublishInfo`. O callback só roda com o plugin aberto no editor.

**Decisão.** Qualquer Watch futuro usará (a) polling periódico da URL pública (ETag/`deploymentTime` não exposto; comparar hash do HTML + screenshot) via Cron Trigger, ou (b) Framer Server API (`getDeployments`), que exige credencial de servidor e não existe no plugin de canvas. Nenhum dos dois é construído agora.
