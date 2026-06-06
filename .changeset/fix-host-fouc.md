---
'@dudousxd/adonis-authkit-server': patch
---

Elimina o FOUC (flash de página sem estilo) em todas as telas server-rendered do host (login, account, console admin): o Tailwind Play CDN (gerava CSS em runtime no browser) foi substituído por CSS estático gerado no build e embutido inline via partial Edge.
