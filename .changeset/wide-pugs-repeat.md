---
"@adonis-agora/authkit-server": patch
"@adonis-agora/authkit-client": patch
"@adonis-agora/authkit-react": patch
"@adonis-agora/authkit-sdk": patch
---

Ship peer dependencies as ranges instead of exact versions

`peerDependencies` pointed at the pinned `adonis`/`frontend` catalogs, and pnpm
inlines a catalog's literal value at publish time — so every published peer came
out exact. `@adonis-agora/authkit-server@0.34.1` on npm requires
`"@adonisjs/core": "7.3.3"`, which no app on 7.3.5 can satisfy;
`@adonis-agora/authkit-react@0.13.0` requires `"react": "19.2.6"`, which locks
out every consumer not on that exact patch.

Peers now resolve from three new range-only catalogs (`adonisPeers`,
`frontendPeers`, `miscPeers`). Dependencies keep the pinned catalogs — a pin is
right for reproducible installs and wrong for consumer compatibility, and the
two were sharing one source.

No source or runtime behaviour changes.
