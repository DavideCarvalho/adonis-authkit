---
"@dudousxd/adonis-authkit-server": patch
---

Limpeza de qualidade (sem mudança de comportamento): fábrica canônica `resolveRuntimeSettings(ctx)` substitui ~16 cópias da resolução de RuntimeSettings (3 nomes diferentes) e elimina o cast `as any` (via `connectionName` tipado no AccountStore); validação de catálogo de role de org extraída para um helper puro reusado pelos caminhos admin e member-facing; `countAdmins` passa a usar uma capability opcional `AccountStore.countByGlobalRole` quando disponível (fallback paginado mantido).
