# @adonis-agora/authkit-core

Contratos compartilhados do AuthKit: `Identity`, `SessionResolver`, tipos de config
do server e nomes de métricas. Sem runtime — consumido por `@adonis-agora/authkit-server` e `@adonis-agora/authkit-client`.

Normalmente você não instala este pacote diretamente: ele vem como dependência
do server e do client. Mas, se precisar dos tipos compartilhados:

## Install

```bash
npm install @adonis-agora/authkit-core
```

## Usage

```ts
import type { Identity, SessionResolver } from '@adonis-agora/authkit-core'

const resolver: SessionResolver = {
  async resolve(): Promise<Identity | null> {
    return null
  },
}
```
