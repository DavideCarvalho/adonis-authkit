---
"@adonis-agora/authkit-server": minor
---

`@vinejs/vine` passa de `dependencies` para `peerDependencies` (range `^4.3.0`). Como lib do ecossistema AdonisJS, o vine deve ser fornecido pelo app consumidor — embuti-lo criava uma segunda cópia do vine e, como o `@adonisjs/core` é peer-chaveado pelo vine, uma segunda instância do core no bundle do consumidor (quebra de boot: `Cannot read properties of undefined (reading 'booted')`). Todo app AdonisJS já tem o vine instalado.
