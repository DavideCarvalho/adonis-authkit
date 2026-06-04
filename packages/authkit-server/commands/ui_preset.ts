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
      return [] // views são donas-da-lib (disco authkit::); nada a scaffoldar
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
