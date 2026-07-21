import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * URL do bundle ESM do `@simplewebauthn/browser` empacotado por
 * `scripts/build_webauthn.mjs`.
 *
 * ⚠️ RESOLVIDO VIA `import.meta.url`, NUNCA relativo ao cwd. Os apps que
 * consomem este pacote rodam `pnpm deploy --legacy`, que remonta a árvore de
 * `node_modules` num diretório novo — um caminho relativo ao cwd do host
 * apontaria para o lugar errado e a rota daria 404 em produção. Ancorado no
 * módulo, o caminho segue o pacote para onde quer que ele seja copiado.
 *
 * Funciona nos dois layouts porque o bundle é commitado em `src/host/assets/`
 * e copiado para `build/src/host/assets/` pelo script `build`:
 *   dev   → src/host/controllers/…       → src/host/assets/webauthn.js
 *   build → build/src/host/controllers/… → build/src/host/assets/webauthn.js
 */
const BUNDLE_URL = new URL('../assets/webauthn.js', import.meta.url)

/**
 * Cache do conteúdo do bundle. É imutável por versão do pacote — ler do disco
 * a cada request de tela de login não compra nada.
 *
 * `null` = ainda não lido. `false` = lido e ausente (404 memoizado); sem isso
 * um bundle faltando viraria um `readFile` que falha por request.
 */
let cached: Buffer | false | null = null

/**
 * GET /authkit/assets/webauthn.js
 *
 * Serve o `@simplewebauthn/browser` a partir do próprio host, substituindo o
 * import de `cdn.jsdelivr.net` que as views de login/MFA/confirm faziam.
 *
 * SEM AUTENTICAÇÃO, e é intencional: é asset estático necessário na tela de
 * login, ou seja, antes de existir qualquer sessão. Também não pode viver sob
 * o prefixo do console admin (que é opt-in) — `login.edge` e
 * `mfa-challenge.edge` precisam do script mesmo num host sem console.
 */
export default class WebauthnAssetController {
  async handle(ctx: HttpContext) {
    if (cached === null) {
      try {
        cached = await readFile(BUNDLE_URL)
      } catch {
        cached = false
      }
    }

    if (cached === false) {
      // 404 limpo: o bundle não foi gerado (`node scripts/build_webauthn.mjs`).
      // A tela degrada para os demais fatores em vez de estourar 500.
      return ctx.response.notFound()
    }

    return ctx.response
      .type('text/javascript')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(cached)
  }
}

/**
 * Limpa o cache do bundle. Existe para os testes conseguirem exercitar tanto o
 * caminho feliz quanto o 404 no mesmo processo.
 *
 * @internal
 */
export function resetWebauthnAssetCache(): void {
  cached = null
}
