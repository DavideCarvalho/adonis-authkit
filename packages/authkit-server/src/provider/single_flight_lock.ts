/** Service do `@adonisjs/lock` (any de propósito — peer opt-in). */
type LockService = any

/**
 * Cria um executor single-flight: roda `fn` SÓ se conseguir o lock de imediato
 * (sem esperar) — garante que apenas UMA instância execute a rotação agendada.
 * Sem `@adonisjs/lock` instalado, assume single-instance e roda `fn` direto
 * (no-lock). Mirror do padrão peer-lazy (limiter/drive). Libera no `finally`.
 */
export interface SingleFlightOptions {
  key: string
  ttlMs: number
  /** Carrega o service do lock (default: import lazy de `@adonisjs/lock/services/main`). */
  loadLock?: () => Promise<LockService | null>
  /** Store do lock (db/redis); default deixa o service usar o default do host. */
  store?: string
}

async function defaultLoadLock(): Promise<LockService | null> {
  const spec = '@adonisjs/lock/services/main'
  return import(spec)
    .then((m) => (m as any).default ?? null)
    .catch(() => null)
}

export function makeSingleFlightLock(
  opts: SingleFlightOptions
): (fn: () => Promise<void>) => Promise<void> {
  const load = opts.loadLock ?? defaultLoadLock
  return async (fn) => {
    const svc = await load()
    if (!svc) return fn() // no-lock (single-instance)
    const lock = (opts.store ? svc.use(opts.store) : svc.use()).createLock(opts.key, opts.ttlMs)
    if (!(await lock.acquireImmediately())) return // outra instância tem o lock
    try {
      await fn()
    } finally {
      await lock.release().catch(() => {})
    }
  }
}
