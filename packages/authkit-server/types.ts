import type { OidcService } from './src/provider/oidc_service.js';

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    'authkit.server': OidcService;
  }
}

export type { OidcService };
