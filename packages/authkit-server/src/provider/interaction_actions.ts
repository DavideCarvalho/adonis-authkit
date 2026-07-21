import type { HttpContext } from '@adonisjs/core/http';

export interface InteractionDeps {
  verifyCredentials?: (email: string, password: string) => Promise<{ id: string } | null>;
}

/** Detalhes opcionais de login (step-up auth): acr alcançado + amr (métodos). */
export interface CompleteLoginExtra {
  acr?: string;
  amr?: string[];
  /**
   * "Manter conectado" (remember-me). Mapeado para `result.login.remember` do
   * oidc-provider. Quando `false`, a sessão se torna transiente (cookie expira ao
   * fechar o browser); o TTL function do provider usa `session.transient` para
   * aplicar o TTL curto (defaultSessionHours). Default: `true` (persistente).
   *
   * NOTA: o campo `remember` em `result.login` é NATIVO do oidc-provider v9 —
   * ver `resume.js`: `let { remember = true, accountId, ... } = result.login`.
   */
  remember?: boolean;
}

export interface InteractionActions {
  details(ctx: HttpContext): Promise<any>;
  login(ctx: HttpContext, input: { email: string; password: string }): Promise<{ ok: boolean }>;
  completeLogin(
    ctx: HttpContext,
    accountId: string,
    extra?: CompleteLoginExtra,
  ): Promise<{ ok: boolean }>;
  consent(ctx: HttpContext): Promise<unknown>;
}

/** Lógica de interaction (login/consent) sobre o provider. Testável com um provider fake. */
export function createInteractionActions(provider: any, deps: InteractionDeps): InteractionActions {
  return {
    async details(ctx) {
      return provider.interactionDetails(ctx.request.request, ctx.response.response);
    },

    async login(ctx, { email, password }) {
      if (!deps.verifyCredentials) {
        throw new Error(
          'authkit: defina `verifyCredentials` no config/authkit.ts para usar o login das interactions.',
        );
      }
      const account = await deps.verifyCredentials(email, password);
      if (!account) return { ok: false };
      await provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { login: { accountId: account.id } },
        { mergeWithLastSubmission: false },
      );
      return { ok: true };
    },

    async completeLogin(ctx, accountId, extra) {
      // acr/amr (RFC 8176): quando um step-up de MFA foi efetivamente cumprido,
      // passamos o acr alcançado + os métodos (amr) para que o id_token os carregue.
      const login: Record<string, unknown> = { accountId };
      if (extra?.acr) login.acr = extra.acr;
      if (extra?.amr?.length) login.amr = extra.amr;
      // remember-me: `remember: false` → sessão transiente (transient: true no provider);
      // `remember: true` ou ausente → sessão persistente (padrão do oidc-provider).
      // O campo `remember` é nativo do oidc-provider v9 — veja resume.js.
      if (extra?.remember === false) login.remember = false;
      await provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { login },
        { mergeWithLastSubmission: false },
      );
      return { ok: true };
    },

    async consent(ctx) {
      const details = await provider.interactionDetails(ctx.request.request, ctx.response.response);
      const grant = new provider.Grant({
        accountId: details.session.accountId,
        clientId: details.params.client_id,
      });
      grant.addOIDCScope(String(details.params.scope ?? 'openid'));
      // Resource Indicators (RFC 8707): quando o authorize/token pede um `resource`
      // (ex.: JWT Access Tokens RFC 9068), o provider sinaliza os scopes faltantes
      // por resource em `prompt.details.missingResourceScopes`. Concedemos cada um
      // para que o resume materialize o AT vinculado àquela API; sem isto o provider
      // re-emite o prompt de consent num laço.
      const missingResourceScopes = (details.prompt?.details as any)?.missingResourceScopes as
        | Record<string, string[]>
        | undefined;
      if (missingResourceScopes) {
        for (const [resource, scopes] of Object.entries(missingResourceScopes)) {
          grant.addResourceScope(resource, (scopes ?? []).join(' '));
        }
      }
      const grantId = await grant.save();
      return provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
    },
  };
}
