---
"@adonis-agora/authkit-server": minor
---

Exporta os tipos de props das telas de conta e os helpers de path do console.

Hosts que criam as telas do console (`/account/*`) em React próprio (via
`inertiaRenderer`) agora tipam cada página com os tipos exportados
`AccountLoginProps`, `AccountSecurityProps`, `AccountMfaProps`,
`AccountConfirmProps` e `AccountEmailConfirmedProps` (mais `AccountConfirmMethod`),
em vez de copiar o shape do docblock à mão. Esses tipos são a fonte única da
verdade: os próprios controllers os satisfazem (`satisfies Omit<…, 'messages'>`)
ao renderizar, então qualquer divergência quebra o build da lib. O docblock do
`inertiaRenderer` passa a referenciar os tipos.

Também passam a ser exportados os helpers de path do console —
`accountPath`, `joinAccountPath`, `accountPrefix` e o tipo `AccountPathsOptions`
(e `AccountPathKey`) — para que um host derive rotas do console (ex.:
`GET ${accountPath('security')}/export`) respeitando os overrides de
`accountRoutes`, em vez de hardcodar. Eles refletem os overrides após
`registerAuthHost` rodar.
