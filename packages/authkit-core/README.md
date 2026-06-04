# @dudousxd/adonis-authkit-core

Contratos compartilhados do AuthKit: `Identity`, `SessionResolver`, tipos de config
do server e nomes de métricas. Sem runtime — consumido por `@dudousxd/adonis-authkit-server` e `@dudousxd/adonis-authkit-client`.

Normalmente você não instala este pacote diretamente: ele vem como dependência
do server e do client. Mas, se precisar dos tipos compartilhados:

## Install

```bash
npm install @dudousxd/adonis-authkit-core
```

## Usage

```ts
import type { Identity, SessionResolver } from '@dudousxd/adonis-authkit-core'

const resolver: SessionResolver = {
  async resolve(): Promise<Identity | null> {
    return null
  },
}
```
