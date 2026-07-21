// `import type` só — apagado no build (mesmo padrão de `augmentations.ts` p/
// @adonisjs/ally/@adonisjs/session). Dá tipagem completa a quem consome este
// provider em `config/auth.ts` SEM criar uma dependência de runtime do peer
// opcional `@adonisjs/auth` — o import de verdade é dinâmico, dentro do
// resolver, e só roda quando o HOST resolve este `ConfigProvider` (ou seja,
// quando o host já escolheu configurar `@adonisjs/auth`).
import type { SessionUserProviderContract } from '@adonisjs/auth/types/session';
import { configProvider } from '@adonisjs/core';
import { RuntimeException } from '@adonisjs/core/exceptions';
import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types';
import type { AuthAccount } from '../accounts/account_store.js';

/**
 * User provider de `@adonisjs/auth` (session guard) apoiado no `accountStore`
 * do próprio authkit — a MESMA fonte de identidade que o login do console de
 * conta autentica. Plugado em `config/auth.ts`:
 *
 * ```ts
 * import { sessionGuard } from '@adonisjs/auth/session'
 * import { authkitUserProvider } from '@adonis-agora/authkit-server'
 *
 * export default defineConfig({
 *   default: 'web',
 *   guards: {
 *     web: sessionGuard({
 *       useRememberMeTokens: false,
 *       provider: authkitUserProvider(),
 *     }),
 *   },
 * })
 * ```
 *
 * Junto com `adonisAuth: { guard: 'web' }` em `config/authkit.ts`, o login do
 * console de conta (`AccountSessionController#login`) passa a chamar
 * `ctx.auth.use('web').login(account)` no sucesso — populando `ctx.auth.user`
 * com um {@link AuthAccount} de verdade para o resto do app (Bouncer,
 * `middleware.auth()`, etc.), sem duplicar a sessão bespoke do authkit
 * (`ACCOUNT_SESSION_KEY`), que continua sendo a fonte de verdade das próprias
 * rotas do authkit.
 *
 * Devolve um `ConfigProvider` (mesmo padrão do `sessionUserProvider()` nativo
 * de `@adonisjs/auth`) — a resolução (incluindo o import dinâmico de
 * `@adonisjs/auth` para o símbolo `PROVIDER_REAL_USER` exigido pelo contrato)
 * só acontece quando o HOST resolve a config do guard no boot, nunca no
 * carregamento deste módulo.
 */
export function authkitUserProvider(): ConfigProvider<SessionUserProviderContract<AuthAccount>> {
  return configProvider.create(async (app: ApplicationService) => {
    let PROVIDER_REAL_USER: symbol;
    try {
      const auth = (await import('@adonisjs/auth')) as { symbols: { PROVIDER_REAL_USER: symbol } };
      PROVIDER_REAL_USER = auth.symbols.PROVIDER_REAL_USER;
    } catch (error) {
      throw new RuntimeException(
        'authkitUserProvider() precisa de "@adonisjs/auth" instalado (é um peer opcional do ' +
          '@adonis-agora/authkit-server, só necessário se você plugar este provider em config/auth.ts). ' +
          'Rode `npm i @adonisjs/auth` (ou pnpm/yarn) e configure um sessionGuard em config/auth.ts.',
        { cause: error },
      );
    }

    // `PROVIDER_REAL_USER` chega em runtime como um `symbol` (não um "unique
    // symbol" literal) — o cast final é seguro pq o valor É literalmente o
    // símbolo exportado por `@adonisjs/auth`, só que o TS não consegue provar
    // isso estruturalmente a partir de um import dinâmico.
    const provider = {
      [PROVIDER_REAL_USER]: undefined as unknown as AuthAccount,
      async createUserForGuard(user: AuthAccount) {
        return {
          getId: () => user.id,
          getOriginal: () => user,
        };
      },
      async findById(identifier: string | number | bigint) {
        const store = await app.container.make('authkit.accountStore');
        const account = await store.findById(String(identifier));
        if (!account) return null;
        return {
          getId: () => account.id,
          getOriginal: () => account,
        };
      },
    };

    return provider as unknown as SessionUserProviderContract<AuthAccount>;
  });
}
