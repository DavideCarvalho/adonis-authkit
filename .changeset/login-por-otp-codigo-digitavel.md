---
"@adonis-agora/authkit-server": minor
---

Adiciona login por OTP (código digitável) como extensão opt-in do magic link.

Hosts passwordless agora podem oferecer, ALÉM do magic link, um código numérico
digitável — para quem lê o e-mail no celular e usa o app no desktop. O MESMO
e-mail passa a carregar link E código, e os dois completam a MESMA interaction
OIDC (amr `['email']`, resultado idêntico ao do link).

Ligue com `login.otp` no `config/authkit.ts` (default **desligado**, back-compat
total — sem a config o comportamento e o e-mail são idênticos aos de antes):

```ts
login: {
  otp: { enabled: true, digits: 6, ttlMinutes: 10, maxAttempts: 5 },
}
```

Segurança (código de 6 dígitos é adivinhável, ≠ magic link de 256 bits):

- **Lockout por interaction fail-CLOSED**: o contador de tentativas fica
  PERSISTIDO junto do código (no mesmo slot do magic link), então a proteção
  anti-brute-force funciona MESMO sem `@adonisjs/limiter` — diferente do
  `otp_lockout` do fator TOTP, que vira no-op sem limiter. Na 5ª falha o código é
  invalidado (o link continua válido). A verificação faz o read-modify-write do
  contador dentro de uma transação com row-lock (`forUpdate`), serializando as
  tentativas: N verificações concorrentes não conseguem burlar o lockout
  (o total de comparações contra um mesmo código fica limitado a `maxAttempts`).
- **Throttle de rota dedicado** `authkit_otp_login` por IP, mais apertado que o
  login (5/min), como camada extra.
- Geração cripto sem viés de módulo (`randomInt`, zero-padded), comparação de
  hash constant-time (`timingSafeEqual`), hash atrelado ao `uid` da interaction.
- **Single-use conjunto**: consumir o código mata o link e vice-versa.

Novidades de API: `login.otp` na config; `OtpLoginCapability` +
`supportsOtpLogin` no account store (o store Lucid default já implementa, sem
migração — co-localiza o código no slot `passwordResetToken`); slot `code` no
template de e-mail e no payload do hook `onMagicLink`; eventos de auditoria
`login.otp_sent` / `login.otp_verified` / `login.otp_failed` /
`login.otp_invalidated`; rota `POST /auth/interaction/:uid/otp-verify`; strings
i18n pt-BR + en. A view Edge default ganha o campo de código no bloco
"link enviado".
