import type { HttpContext } from '@adonisjs/core/http'
import { timingSafeEqual } from 'node:crypto'

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false
  const provided = header.slice(7)
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default class PatIntrospectionController {
  async handle(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const secret = cfg.patIntrospectionSecret

    if (!secret || !bearerMatches(ctx.request.header('authorization'), secret)) {
      return ctx.response.unauthorized({ error: 'invalid_client' })
    }

    const token = ctx.request.input('token')
    if (!token || typeof token !== 'string') {
      return { active: false }
    }

    const meta = await cfg.patStore!.findActiveByToken(token)
    if (!meta) return { active: false }

    const account = await cfg.accountStore.findById(meta.accountId)
    if (!account) return { active: false }

    await cfg.audit?.record({
      type: 'pat.used',
      accountId: account.id,
      email: account.email,
      ip: ctx.request.ip?.() ?? null,
      metadata: { audience: meta.audience },
    })

    return {
      active: true,
      sub: account.id,
      email: account.email,
      name: account.name ?? null,
      roles: account.globalRoles ?? [],
      scopes: meta.scopes,
      audience: meta.audience,
      exp: meta.exp,
    }
  }
}
