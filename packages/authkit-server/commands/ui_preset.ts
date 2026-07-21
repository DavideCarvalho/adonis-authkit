export type UiPreset = 'headless' | 'edge' | 'react'

const VALID: UiPreset[] = ['headless', 'edge', 'react']

export function resolveUiPreset(value: string | undefined): UiPreset {
  if (value === undefined) return 'edge'
  if (!VALID.includes(value as UiPreset)) {
    throw new Error(`authkit: --ui inválido "${value}". Use: ${VALID.join(' | ')}`)
  }
  return value as UiPreset
}

/** Caminhos de stub (relativos ao stubsRoot) que o preset publica. */
export function uiStubPaths(preset: UiPreset): string[] {
  switch (preset) {
    case 'headless':
      return []
    case 'edge':
      /**
       * Views são donas-da-lib (disco `authkit::`); nada a scaffoldar.
       *
       * Quem quer customizar usa `node ace authkit:eject --views`, que copia as
       * views REAIS de `src/host/views` — com i18n, CSRF, passkey e o CSS já
       * compilado em `partials/styles.edge`, sem nenhuma requisição externa.
       *
       * Houve stubs Edge de login/consent aqui, mas nenhum caminho de código os
       * publicava (este `case` sempre devolveu `[]`). Como código morto que
       * mesmo assim ia no pacote, ficaram para trás do resto: carregavam o
       * Tailwind Play CDN muito depois de as views da lib terem migrado para o
       * CSS compilado. Foram removidos em vez de ressuscitados — o scaffold era
       * uma duplicata inferior das views da lib (sem `_csrf`, inclusive).
       */
      return []
    case 'react':
      return [
        'ui/react/components/auth_shell.tsx',
        'ui/react/pages/login.tsx',
        'ui/react/pages/consent.tsx',
        'ui/react/pages/signup.tsx',
        'ui/react/pages/forgot.tsx',
        'ui/react/pages/reset.tsx',
        'ui/react/pages/verify-email.tsx',
        'ui/react/pages/mfa-challenge.tsx',
        'ui/react/pages/account/login.tsx',
        'ui/react/pages/account/tokens.tsx',
        'ui/react/pages/account/mfa.tsx',
      ]
  }
}
