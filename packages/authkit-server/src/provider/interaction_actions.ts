import type { HttpContext } from '@adonisjs/core/http'

export interface InteractionDeps {
  verifyCredentials?: (email: string, password: string) => Promise<{ id: string } | null>
}

export interface InteractionActions {
  details(ctx: HttpContext): Promise<any>
  login(ctx: HttpContext, input: { email: string; password: string }): Promise<{ ok: boolean }>
  completeLogin(ctx: HttpContext, accountId: string): Promise<{ ok: boolean }>
  consent(ctx: HttpContext): Promise<unknown>
}

/** Lógica de interaction (login/consent) sobre o provider. Testável com um provider fake. */
export function createInteractionActions(provider: any, deps: InteractionDeps): InteractionActions {
  return {
    async details(ctx) {
      return provider.interactionDetails(ctx.request.request, ctx.response.response)
    },

    async login(ctx, { email, password }) {
      if (!deps.verifyCredentials) {
        throw new Error(
          'authkit: defina `verifyCredentials` no config/authkit.ts para usar o login das interactions.'
        )
      }
      const account = await deps.verifyCredentials(email, password)
      if (!account) return { ok: false }
      await provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { login: { accountId: account.id } },
        { mergeWithLastSubmission: false }
      )
      return { ok: true }
    },

    async completeLogin(ctx, accountId) {
      await provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { login: { accountId } },
        { mergeWithLastSubmission: false }
      )
      return { ok: true }
    },

    async consent(ctx) {
      const details = await provider.interactionDetails(ctx.request.request, ctx.response.response)
      const grant = new provider.Grant({
        accountId: details.session.accountId,
        clientId: details.params.client_id,
      })
      grant.addOIDCScope(String(details.params.scope ?? 'openid'))
      const grantId = await grant.save()
      return provider.interactionFinished(
        ctx.request.request,
        ctx.response.response,
        { consent: { grantId } },
        { mergeWithLastSubmission: true }
      )
    },
  }
}
