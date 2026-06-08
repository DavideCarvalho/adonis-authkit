---
'@dudousxd/adonis-authkit-react': minor
---

feat: gestão de rotação de chave JWKS no React SDK. Novo `client.admin.keys.status()`
e `client.admin.keys.rotate()` (console API session-authed — sem API key no browser),
hooks headless TanStack `useKeysQueryOptions`/`useRotateKeysMutationOptions`, e o
componente `<KeyRotation>` (idade da chave, política, ETA e botão "Rotacionar agora").
