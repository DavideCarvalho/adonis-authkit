---
"@adonis-agora/authkit-server": patch
---

Corrige a tela `session-expired` respondendo 400 com corpo vazio (recuperação de interaction perdida no modo `screen`)

A recuperação graciosa da sessão de interaction perdida introduzida na 0.52.0
estava QUEBRADA out-of-the-box no modo `screen` (default): renderizava um 400
com **corpo vazio** em qualquer host, sem uma ponte manual no
`app/exceptions/handler.ts`.

Causa: no modo `screen`, `recoverLostInteraction` fazia `return render(...)`, e
tanto o renderer Edge (`view.render`) quanto o Inertia (`inertia.render`)
RETORNAM o HTML/payload em vez de escrever no response. No caminho de exception
handler do AdonisJS, o valor retornado do `handle()` da exceção é DESCARTADO
(apenas o dispatch normal de rota escreve o retorno via `useReturnValue`/
`canWriteResponseBody`), então o corpo nunca era enviado — contradizendo o
próprio contrato da feature ("roda de forma centralizada, sem depender de o host
customizar o `app/exceptions/handler.ts`").

Correção: no modo `screen`, a lib agora ESCREVE o body ela mesma, replicando
fielmente o contrato `canWriteResponseBody` do http-server — após
`ctx.response.status(400)`, `const body = await render(...)` e, se
`body !== undefined && !ctx.response.hasLazyBody && body !== ctx.response`,
`ctx.response.send(body)`. O guard `hasLazyBody` evita double-write e cobre os
DOIS renderers built-in (Edge e Inertia). O modo `redirect` e o fluxo normal
(sessão válida) permanecem inalterados.
