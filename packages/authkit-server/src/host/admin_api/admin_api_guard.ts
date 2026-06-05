import { timingSafeEqual } from 'node:crypto'

/**
 * Compara o Bearer recebido contra a lista de API keys em tempo constante. Cada
 * comparação só roda quando os comprimentos batem (o `timingSafeEqual` lança em
 * tamanhos diferentes); o curto-circuito por comprimento NÃO vaza a key (só o seu
 * tamanho), aceitável para um segredo de alta entropia gerado pelo operador.
 */
function keyMatches(header: string | undefined, keys: string[]): boolean {
  if (!header || !header.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice(7))
  let matched = false
  for (const key of keys) {
    const expected = Buffer.from(key)
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      matched = true
    }
  }
  return matched
}

/**
 * Guard da Admin REST API (R6). Espelha o `adminGuard` do console (B6):
 *   0. `config.adminApi.enabled` desligado → 404 (não vaza a existência da API);
 *   1. `Authorization: Bearer <key>` ausente/inválido → 401 JSON.
 * Sem nenhuma API key configurada, qualquer request é 401 (fail-safe). As respostas
 * de erro seguem o envelope `{ error: { code, message } }`.
 */
export const adminApiGuard = async (ctx: any, next: () => Promise<void>) => {
  const service = await ctx.containerResolver.make('authkit.server')
  const cfg = service.config
  if (!cfg.adminApi.enabled) {
    return ctx.response.notFound()
  }
  const keys = cfg.adminApi.apiKeys as string[]
  if (keys.length === 0 || !keyMatches(ctx.request.header('authorization'), keys)) {
    return ctx.response.unauthorized({
      error: { code: 'unauthorized', message: 'API key ausente ou inválida.' },
    })
  }
  return next()
}
