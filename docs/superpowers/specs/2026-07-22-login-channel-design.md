# Login "choose-first": seletor de método antes de enviar

**Data:** 2026-07-22 · **Status:** aprovado em conversa · **Motivação:** o fluxo atual manda link+código sempre e mostra o seletor DEPOIS ("send-both"). O usuário quer o modelo GitHub: escolher o método PRIMEIRO, e aí executar só aquele. Justificativa de escala: link e código são o mesmo canal (e-mail) — o seletor só faz sentido pleno quando entra o passkey (método genuinamente distinto), então o desenho choose-first é o que acomoda os três.

## Fluxo alvo (3 telas → 3 telas, mas a do meio muda de papel)

1. **E-mail** — input, "Continuar" (inalterado).
2. **Seletor de método** (NOVO papel — substitui a tela de "confirmar e enviar"):
   "Como você quer entrar?" com as opções disponíveis, dirigido por dados:
   - `#⃣ Receber um código` → dispara e-mail com SÓ o código, tela mostra campo de 6 dígitos.
   - `✉️ Receber um link mágico` → dispara e-mail com SÓ o link, tela mostra "confira sua caixa" (+ reenviar).
   - `🔑 Usar uma passkey` — SLOT documentado, NÃO implementado agora (entra em ciclo futuro; o array de métodos já o prevê).
3. **Execução do método escolhido** — campo de código OU aviso de link enviado.

## Decisões travadas

1. **Sem cirurgia no codec `ml2:` nem na segurança.** A lib continua emitindo os dois tokens co-locados (single-use-conjunto + lockout row-lock 0.50.0 intactos). O que muda é o que o e-mail e a tela SURFAM.
2. **Parâmetro `channel`** (`'code' | 'link'`) no `POST /auth/interaction/:uid/magic`: o `magicLinkRequest` lê o campo, e:
   - threada `channel` para `cfg.mail.onMagicLink({ email, magicUrl, token, code, channel })` (novo campo opcional — hosts existentes ignoram; back-compat) E para o `sendMagicLinkEmail` default (renderiza só link ou só código conforme `channel`).
   - passa `channel` nas props do render (`otpChannel`/`magicChannel`) pra tela saber qual sub-view mostrar no estado `magicLinkSent`.
   - `channel` ausente (hosts que ainda POSTam sem o campo) = comportamento atual (manda os dois) — back-compat total.
3. **App:** a tela 2 vira o seletor (`login.tsx`), cada opção é um form clássico POSTando `/magic` com `_csrf` + `channel=code|link`. O estado `magicLinkSent` usa a prop de channel pra renderizar SÓ o campo de código (se `code`) ou SÓ o aviso de link (se `link`). O array de métodos mantém o slot de passkey (desabilitado/oculto por ora).
4. **Config default:** `login.otp.enabled` já liga o código; sem mudança de config nova. Se `otp` desligado, o seletor mostra só "link mágico" (degradação limpa — uma opção só, ou pula direto pro envio de link).

## Fora de escopo

Passkey login (ceremony na interaction) — ciclo próprio. SMS. Reuso pra sudo.

## Critérios de aceite

- Lib: `channel=code` → e-mail só com código, props indicam code; `channel=link` → e-mail só com link, props indicam link; `channel` ausente → both (suíte existente passa sem alteração = prova de back-compat). Testes dos dois canais + ausência. Segurança inalterada (nenhum teste de single-use-conjunto/lockout muda).
- App: seletor renderiza as opções disponíveis; escolher código leva ao campo e completa login; escolher link mostra aviso; e-mail bate com a escolha (teste e2e HTTP dos dois caminhos); passkey não vaza UI morta.
