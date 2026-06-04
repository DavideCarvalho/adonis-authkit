import type { Authenticator } from './src/authenticator.js'
import type { AuthkitClientManager } from './providers/authkit_client_provider.js'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    auth: Authenticator
  }
}
declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    'authkit.client': AuthkitClientManager
  }
}
export type { Authenticator, AuthkitClientManager }
