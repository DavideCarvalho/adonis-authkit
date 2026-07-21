import { password } from './methods/password.js'
import { passkey } from './methods/passkey.js'
import { oidcStepUp } from './methods/oidc_step_up.js'
import { magicLink } from './methods/magic_link.js'

/**
 * Métodos de confirmação de identidade (sudo mode), no mesmo padrão de factory
 * usado em `stores.*` e `retrievers.*` das libs irmãs.
 *
 * A lista vai em DOIS lugares, e eles precisam casar:
 *
 * - `config/authkit.ts` → `sudo.methods` decide o que a TELA oferece e o que os
 *   handlers ACEITAM;
 * - `registerAuthHost(router, { sudoMethods })` decide o que tem ROTA montada.
 *
 * São dois porque a montagem de rotas acontece antes de o config (lazy)
 * resolver — mesma razão de `social`/`admin`/`rateLimit`. Divergiram, a tela
 * loga um aviso de flag-drift e o endpoint faltante dá 404.
 *
 * ```ts
 * defineConfig({
 *   sudo: {
 *     methods: [
 *       sudoMethods.oidcStepUp({ url: '/auth/step-up' }),
 *       sudoMethods.magicLink(),
 *       sudoMethods.passkey(),
 *       sudoMethods.password(),
 *     ],
 *   },
 * })
 * ```
 */
export const sudoMethods = { password, passkey, oidcStepUp, magicLink }

export type { SudoMethod, SudoContext, SudoMethodDescriptor, SudoRouteHelpers } from './types.js'

/**
 * Montagem do `SudoContext` a partir do `HttpContext`. Reexportado aqui por
 * simetria com `sudoMethods` e os tipos: quem escreve um método (ou a rota de
 * callback do `oidcStepUp`) precisa dos três, e não deveria ter de importar de
 * `controllers/account_confirm_controller.js` para pegar um.
 */
export { sudoContextFrom } from '../controllers/account_confirm_controller.js'
