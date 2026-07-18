---
"@adonis-agora/authkit-client": minor
---

`Authenticator.getUserOrFail(): Promise<TUser>` — o usuário autenticado NÃO-nulo, fail-closed (lança quando não há sessão ou `resolveUser` não devolve usuário). Espelha `authenticate()` (que devolve a `Identity`); este devolve o usuário do app.

Substitui o wrapper `currentUser(auth)` que cada app reescrevia sobre `getUser()`:

```ts
// antes (helper por app):
const user = await currentUser(auth);
// agora:
const user = await auth.getUserOrFail();
```

Com o generic na augmentation (`auth: Authenticator<AppUser>`), devolve `AppUser` direto, sem cast. Para rotas com visitante, siga usando `getUser()` (`TUser | null`).
