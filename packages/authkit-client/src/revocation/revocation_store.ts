/**
 * Store de revogações de sessão para OIDC Back-Channel Logout sobre sessões
 * COOKIE-BASED (sem store server-side).
 *
 * Diferente do {@link SessionIndex} (que mapeia sid/sub -> sessionId local e só
 * funciona quando há um store de sessão server-side com id estável), este store
 * implementa o padrão "log de revogação + checagem na request":
 *
 *  1. ao receber um logout_token válido, grava-se a revogação (sid e/ou sub);
 *  2. em toda request, o {@link BackchannelRevocationMiddleware} extrai sid/sub/iat
 *     do id_token guardado na sessão e pergunta `isRevoked()`;
 *  3. se revogada, o middleware limpa o token set da sessão local.
 *
 * Semântica de revogação:
 *  - por `sid`  → derruba UMA sessão SSO específica (logout normal no IdP);
 *  - por `sub`  → derruba TODAS as sessões do usuário criadas ANTES de `revokedAt`
 *    (revogação em massa). A comparação com o `iat` do id_token garante que logins
 *    POSTERIORES à revogação continuem válidos.
 */
export interface RevocationStore {
  /** Persiste uma revogação recebida via back-channel logout (ou disparada pelo IdP). */
  revoke(event: { sid?: string; sub?: string }): Promise<void>
  /**
   * @param authTime `iat` (epoch seconds) do id_token da sessão local — o momento
   *   em que ESTA sessão foi estabelecida. Usado para o caso `sub` (massa).
   */
  isRevoked(params: { sid?: string; sub?: string; authTime?: number }): Promise<boolean>
  /** Remove revogações mais antigas que `olderThanDays` (default 35). */
  prune(olderThanDays?: number): Promise<void>
}

export interface LucidRevocationStoreOptions {
  /**
   * Conexão Lucid a usar. Default: conexão primária. Aponte para uma conexão cujo
   * `searchPath` enxergue o schema onde a tabela vive (ex.: `auth`). A tabela é
   * compartilhável entre apps que apontam para o MESMO banco.
   */
  connection?: string
  /** Nome da tabela. Default: `auth_session_revocations` (criada pelo schema auto-manage do server). */
  table?: string
}

/** Nome default da tabela — alinhado ao `ensureAuthkitSchema()` do authkit-server. */
export const DEFAULT_REVOCATION_TABLE = 'auth_session_revocations'

/**
 * Implementação do {@link RevocationStore} sobre `@adonisjs/lucid`. A tabela é
 * append-only (id auto-increment); a leitura/escrita usa o query builder cru, então
 * o consumidor NÃO precisa declarar um model.
 *
 * Requer `@adonisjs/lucid` instalado (peer dependency). O import é lazy para não
 * acoplar o pacote a lucid quando este store não é usado.
 */
export function lucidRevocationStore(options: LucidRevocationStoreOptions = {}): RevocationStore {
  const table = options.table ?? DEFAULT_REVOCATION_TABLE

  async function client() {
    const db = (await import('@adonisjs/lucid/services/db')).default
    return options.connection ? db.connection(options.connection) : db.connection()
  }

  return {
    async revoke(event) {
      if (!event.sid && !event.sub) return
      const conn = await client()
      await conn.insertQuery().table(table).insert({
        sid: event.sid ?? null,
        sub: event.sub ?? null,
        revoked_at: new Date(),
      })
    },

    async isRevoked({ sid, sub, authTime }) {
      if (!sid && !sub) return false
      const conn = await client()
      const query = conn.query().from(table)

      if (sid && sub) {
        query.where((q: any) => {
          q.where('sid', sid)
          if (authTime) {
            q.orWhere((qq: any) => {
              qq.where('sub', sub).where('revoked_at', '>=', new Date(authTime * 1000))
            })
          }
        })
      } else if (sid) {
        query.where('sid', sid)
      } else if (sub && authTime) {
        query.where('sub', sub).where('revoked_at', '>=', new Date(authTime * 1000))
      } else {
        // sub sem authTime: sem âncora temporal não dá pra distinguir sessões antigas
        // de novas — não revoga (evita logout em loop de logins legítimos).
        return false
      }

      const row = await query.select('id').first()
      return row !== null && row !== undefined
    },

    async prune(olderThanDays = 35) {
      const conn = await client()
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
      await conn.query().from(table).where('revoked_at', '<', cutoff).delete()
    },
  }
}
