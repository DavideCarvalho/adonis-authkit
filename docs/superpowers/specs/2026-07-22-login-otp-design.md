# Login por OTP (código digitável) — design

**Data:** 2026-07-22 · **Status:** aprovado em conversa (lib first-class) · **Repo:** adonis-authkit / `packages/authkit-server`

## Motivação

Hosts passwordless só têm magic link. Quem lê o e-mail no celular e usa o app no
desktop precisa de um código digitável. O mesmo e-mail passa a carregar link E
código; os dois caminhos completam a MESMA interaction OIDC.

## Por que first-class na lib (não hack no host)

Código de 6 dígitos é ADIVINHÁVEL (≠ magic link de 256 bits). Validação exige
lockout dedicado + throttle — segurança que não se reimplementa por host. E o
`completeLogin` da interaction é interno à lib.

## Decisões

1. **Emissão:** `POST /auth/interaction/:uid/magic` (o `magicLinkRequest`
   existente, `interaction_controller.ts:719`) passa a gerar TAMBÉM um código de
   6 dígitos quando `login.otp.enabled` — mesmo disparo, mesmo e-mail, mesmo
   throttle `withLogin`.
2. **Escopo do código:** atrelado à INTERACTION (uid), não à conta. O usuário
   digita o código no MESMO browser que iniciou o fluxo (o cross-device continua
   sendo o papel do link). Armazenamento preferencial: payload/registro da
   própria interaction (`otpHash` SHA-256, `otpExpiresAt`, `otpAttempts`) — sem
   migração, TTL herdado. Se a storage de interaction não aceitar campos extras,
   fallback (nesta ordem): formato composto no slot existente do token
   (`passwordResetToken`, hoje `ml:<token>` → `ml2:<token>:<codeHash>:<exp>`)
   ou coluna nova via ensure-schema. A investigação decide; a decisão vai
   documentada no código.
3. **Verificação:** novo `POST /auth/interaction/:uid/otp-verify` recebendo
   `code`. Ordem das checagens: throttle de rota (bucket novo `authkit_otp_login`
   por IP, mais apertado que login) → interaction válida → lockout
   (`maxAttempts: 5` POR INTERACTION; espelhar o padrão fail-safe de
   `otp_lockout.ts`, mas o contador vive com o código/interaction) → TTL
   (`ttlMinutes: 10`) → comparação constant-time do hash. Falha incrementa
   tentativa; 5ª falha INVALIDA o código (o link continua válido). Sucesso:
   consome o código E o magic link token (single-use conjunto — um caminho usado
   mata o outro), completa a interaction como o `magicLinkConsume` faz.
4. **Config:** `login.otp?: { enabled?: boolean; digits?: number; ttlMinutes?:
   number; maxAttempts?: number }`, default **DESLIGADO** (opt-in; back-compat
   total — sem a config, zero mudança de comportamento, e-mail idêntico).
5. **E-mail:** `EmailTemplateInput` (`email_templates.ts:15`) ganha slot
   opcional `code` (renderizado grande/monoespaçado); `sendMagicLinkEmail`
   preenche quando houver; payload do hook `onMagicLink` ganha `code?: string`
   (host pode montar e-mail próprio). i18n pt-BR + en para as strings novas.
6. **Props/tela:** a view `login` (renderer) no estado `magicLinkSent` ganha
   `otpEnabled: boolean` + o que o form de verify precisa (uid já está na URL;
   csrfToken já existe). `AccountLoginProps` (single-source, `satisfies`)
   atualizado. A view Edge default (`login.edge`) ganha o form de código no
   bloco `magicLinkSent`.
7. **Auditoria:** eventos `login.otp_sent` / `login.otp_verified` /
   `login.otp_failed` / `login.otp_invalidated` no audit sink, como os `otp.*`
   existentes.

## Fora de escopo

Tela React do meuprontuario (app-side, projeto separado pós-release); OTP por
SMS; reuso do código para sudo.

## Critérios de aceite

- Suíte existente passa SEM alteração com a config ausente (prova de back-compat).
- Testes novos: e-mail carrega código quando habilitado; verify feliz completa a
  interaction (mesmo resultado do link); código errado 5× → invalidado (e o
  link AINDA funciona); código expirado recusa; código usado → link morto e
  vice-versa; throttle do endpoint responde 429; contador não vaza entre
  interactions distintas; mutação real: remover a checagem de lockout → teste
  vermelho.
