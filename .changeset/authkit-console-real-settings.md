---
"@adonis-agora/authkit-server": minor
---

Console admin: a página **Settings** agora é plugada nas settings de runtime REAIS de `auth_settings`
(antes eram keys placeholder que não batiam com nenhum resolver). Cada seção mapeia uma
`SETTING_KEYS` estruturada e edita seus campos, gravando o objeto inteiro via `PUT /api/settings/:key`.

Seções: **Métodos de login** (`auth_methods` — password/magicLink/passkey/forgotPassword/passkeyAutofill),
Cadastro (`registration`), Verificação de e-mail (`require_verified_email`), Manutenção
(`maintenance_mode`), Lockout (`lockout`), TTL dos tokens (`token_ttl`).

Settings travadas via `defineConfig()` (config-locks) aparecem com o selo "definido via config",
os controles desabilitados e o aviso "Travado no defineConfig() — config tem prioridade sobre runtime".
Ex.: `defineConfig({ authMethods: { password: false } })` deixa a seção Métodos de login read-only.
