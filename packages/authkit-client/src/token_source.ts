import type { HttpContext } from '@adonisjs/core/http'
import type { TokenSet } from './types.js'

export type TokenSource = 'session' | 'bearer'

export function getTokenFromSource(ctx: HttpContext, source: TokenSource, sessionKey: string): string | null {
  if (source === 'bearer') {
    const header = (ctx.request as any).header('authorization') as string | undefined
    if (!header) return null
    const [scheme, value] = header.split(' ')
    return scheme?.toLowerCase() === 'bearer' && value ? value : null
  }
  // session: o ID token (que é JWT) é o token validado por JWKS
  const tokenSet = (ctx as any).session?.get(sessionKey) as TokenSet | undefined
  return tokenSet?.idToken ?? null
}
