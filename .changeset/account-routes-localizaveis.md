---
"@adonis-agora/authkit-server": minor
---

Rotas do console de conta configuráveis/localizáveis + 2 fixes de MFA

**Feature: `accountRoutes`.** Novo módulo `account_paths.ts` (singleton de processo, no mesmo padrão de `admin_prefix`/`account_login_url`) que torna o prefixo do console de conta (`/account` → `/conta`) e o segmento de cada tela navegável (`security` → `seguranca`, `confirm` → `confirmar`, ...) configuráveis via a opção top-level `accountRoutes: { prefix?, paths? }` no `registerAuthHost`. O prefixo/segmentos se propagam por todas as camadas: registro de rotas, redirects dos controllers, redirect de sudo, fluxo magic-link, URLs dos e-mails transacionais e as views Edge (incl. os `fetch()` do `mfa.edge`, via a prop global `accountPaths`). `getAccountLoginUrl` e `accountHome` passam a derivar dos overrides.

Os action-subpaths dos POSTs internos (`/password`, `/enroll`, `/passkeys/verify`, ...) e o segmento `api` da JSON API (`{prefix}/api/*`) permanecem FIXOS — são endpoints de máquina, invisíveis ao usuário. A opção é top-level de propósito: mesmo com `account: false`, as rotas de sudo e a JSON API continuam montadas e respeitam o prefixo.

Back-compat total: sem `accountRoutes`, tudo permanece em `/account/*`.

**Fix (`inertiaRenderer`):** o docblock de contrato de props da tela `account/mfa` documentava só o shape do `index`; agora inclui `enrolling`, `secret`, `qrDataUrl` e `error`, que o controller injeta nos passos de `enroll`/`confirm`.

**Fix (`passkeyRegisterVerify`):** no sucesso com sudo já ativo o endpoint respondia sempre `{ ok: true }` JSON — um `<form>` HTML clássico ficava encarando JSON cru. Agora detecta navegação (aceita `text/html` e não pede `application/json`) e responde redirect para a tela de MFA, mantendo o JSON para XHR/fetch.
