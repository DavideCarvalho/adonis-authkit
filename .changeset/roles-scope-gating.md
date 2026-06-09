---
"@dudousxd/adonis-authkit-server": minor
"@dudousxd/adonis-authkit-client": minor
---

Segurança (least privilege): a claim de papéis globais e as claims de organização saem do scope `profile` para um scope dedicado `roles`, e sua emissão é gated a clients first-party (`branding.firstParty`). Clients third-party NÃO recebem papéis/org, mesmo solicitando o scope `roles`. O default de scopes do authkit-client passa a incluir `roles` (consumidores first-party continuam recebendo papéis sem mudança de comportamento). BREAKING para quem dependia de papéis no scope `profile`: o client precisa solicitar o scope `roles`.
