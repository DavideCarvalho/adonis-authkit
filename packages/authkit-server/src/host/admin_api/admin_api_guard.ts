import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Identificador NÃO-SENSÍVEL e estável da API key que autenticou a request, para
 * trilha de auditoria (M9). Deriva de um SHA-256 da key e expõe só um prefixo
 * curto do hash — NUNCA a key em si nem qualquer pedaço dela. Estável entre
 * requests (mesma key → mesmo id), permitindo saber QUAL key agiu sem vazar o
 * segredo. Formato: `admin-key:<8 hex>`.
 */
export function adminKeyId(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 8)
  return `admin-key:${digest}`
}

/**
 * Compara o Bearer recebido contra a lista de API keys em tempo constante. Cada
 * comparação só roda quando os comprimentos batem (o `timingSafeEqual` lança em
 * tamanhos diferentes); o curto-circuito por comprimento NÃO vaza a key (só o seu
 * tamanho), aceitável para um segredo de alta entropia gerado pelo operador.
 *
 * Retorna a key que casou (para derivar o id de auditoria) ou `null`. A varredura
 * NÃO faz short-circuit no primeiro match — mantém o tempo independente de QUAL
 * key casou.
 */
function matchKey(header: string | undefined, keys: string[]): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  const provided = Buffer.from(header.slice(7))
  let matched: string | null = null
  for (const key of keys) {
    const expected = Buffer.from(key)
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      matched = key
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
  const matched = keys.length === 0 ? null : matchKey(ctx.request.header('authorization'), keys)
  if (!matched) {
    return ctx.response.unauthorized({
      error: { code: 'unauthorized', message: 'API key ausente ou inválida.' },
    })
  }
  // Anexa um id NÃO-SENSÍVEL da key ao contexto para a trilha de auditoria (M9).
  ctx.adminApiKeyId = adminKeyId(matched)
  return next()
}
