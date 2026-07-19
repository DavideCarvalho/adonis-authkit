---
"@adonis-agora/authkit-server": minor
---

`defineConfig` agora aceita `authMethods` para FIXAR métodos de login pelo arquivo de config, com
PRIORIDADE sobre o runtime setting `auth_methods` (integra ao mecanismo de config-locks existente).

Declarar `authMethods` trava a key `auth_methods`: o valor do config manda, o console admin/Admin API
não altera em runtime (rejeita com 423) e a UI lê `lockedSettingKeys()` pra desabilitar o controle.
Cada campo declarado (`password`, `magicLink`, `passkey`, `forgotPassword`) sobrescreve o resolvido do
setting. Guards preservados: ligar respeita a capacidade (magicLink/passkey só ligam se capable);
desligar sempre vale; fail-safe all-off volta aos defaults (nunca tranca todo mundo pra fora).

```ts
// Login sem senha (magic-link + passkey), fixado pelo config — sem comando por ambiente:
defineConfig({ authMethods: { password: false }, passwordless: { magicLink: true } })
```

Substitui a necessidade de rodar `node ace authkit:disable-password` por ambiente quando o objetivo é
declarar a política no código.
