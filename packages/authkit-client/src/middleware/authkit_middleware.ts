import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

export default class AuthkitMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const manager = await ctx.containerResolver.make('authkit.client');
    // Renova proativamente o TokenSet (rotação de refresh token) antes de resolver.
    await manager.maybeRefresh(ctx);
    ctx.auth = await manager.createAuthenticator(ctx);
    return next();
  }
}
