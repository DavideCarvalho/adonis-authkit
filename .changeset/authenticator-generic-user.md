---
'@adonis-agora/authkit-client': minor
---

`Authenticator` agora é genérico no tipo do usuário do app: `Authenticator<TUser = unknown>`, com `getUser(): Promise<TUser | null>` e `toSharedProps().user: TUser | null`. Non-breaking (default `unknown` mantém o comportamento anterior). Um app fixa o tipo augmentando `HttpContext.auth` (`auth: Authenticator<AppUser>`) e aí `getUser()` devolve `AppUser | null` em todo call-site — acaba o `(await auth.getUser()) as AppUser` repetido. A asserção do model do app fica UMA vez, dentro de `getUser`, em vez de espalhada.
