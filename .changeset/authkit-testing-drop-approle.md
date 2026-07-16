---
'@adonis-agora/authkit-testing': minor
---

Remove `hasAppRole`/`appRoles` from the fake `Authenticator` (`fakeAuthenticator`), matching the real
`@adonis-agora/authkit-client` surface after app-role authorization moved out of AuthKit. The fake now
exposes only `hasGlobalRole` (token roles). 0.x breaking.
