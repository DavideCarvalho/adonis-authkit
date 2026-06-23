import type { HttpContext } from '@adonisjs/core/http'
import type { Identity, SessionResolver } from '@adonis-agora/authkit-core'
import { buildIdentityFromClaims, introspectToken } from './identity.js'

type FetchImpl = (url: string, init: any) => Promise<{ ok: boolean; json: () => Promise<any> }>

export interface PatResolverConfig {
  introspectionUrl: string
  introspectionSecret: string
  fetchImpl?: FetchImpl
}

export class PatResolver implements SessionResolver {
  constructor(private config: PatResolverConfig) {}

  #getToken(ctx: HttpContext): string | null {
    const header = ctx.request.header('authorization')
    if (!header || !header.startsWith('Bearer ')) return null
    const token = header.slice(7).trim()
    return token.startsWith('pat_') ? token : null
  }

  async resolve(ctx: HttpContext): Promise<Identity | null> {
    const token = this.#getToken(ctx)
    if (!token) return null

    const data = await introspectToken(
      this.config.introspectionUrl,
      token,
      { type: 'bearer', value: this.config.introspectionSecret },
      { fetchImpl: this.config.fetchImpl }
    )
    if (!data) return null

    // PAT carrega os papéis na claim literal `roles`.
    return buildIdentityFromClaims(data, 'roles')
  }
}
