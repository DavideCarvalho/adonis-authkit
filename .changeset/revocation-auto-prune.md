---
'@dudousxd/adonis-authkit-client': minor
---

`lucidRevocationStore` agora faz auto-prune — limpeza vem da lib, não do app

Antes, o app precisava agendar o `prune()` das revogações de back-channel logout
(scheduler/job). Agora o `lucidRevocationStore` limpa sozinho: no `revoke()`, de
forma OPORTUNÍSTICA e throttled (no máx. 1× por `everyHours` por processo, default
24h), remove revogações mais velhas que `olderThanDays` (default 35). Best-effort —
falha não atrapalha o logout.

- Default LIGADO; configure via `lucidRevocationStore({ autoPrune: { everyHours, olderThanDays } })`.
- Desligue com `autoPrune: false` (ex.: se preferir agendar você mesmo).

Resultado: o consumidor não precisa mais de nenhum scheduler/job para a limpeza.
