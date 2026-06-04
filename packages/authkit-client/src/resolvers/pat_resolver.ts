import type { HttpContext } from '@adonisjs/core/http'
import type { Identity, SessionResolver } from '@dudousxd/adonis-authkit-core'

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

    const doFetch = this.config.fetchImpl ?? (fetch as unknown as FetchImpl)
    const res = await doFetch(this.config.introspectionUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.introspectionSecret}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.active) return null

    return {
      userId: String(data.sub),
      email: typeof data.email === 'string' ? data.email : '',
      globalRoles: Array.isArray(data.roles) ? data.roles : [],
      profile: { name: typeof data.name === 'string' ? data.name : undefined },
      issuedAt: 0,
      expiresAt: typeof data.exp === 'number' ? data.exp * 1000 : 0,
      raw: data,
    }
  }
}
