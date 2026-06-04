import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from '../stubs/main.js'

export async function configure(command: Configure) {
  const codemods = await command.createCodemods()
  await codemods.makeUsingStub(stubsRoot, 'config/authkit_client.stub', {})
  await codemods.makeUsingStub(stubsRoot, 'controllers/oidc_session_controller.stub', {})
  await codemods.updateRcFile((rc) => rc.addProvider('@dudousxd/adonis-authkit-client/authkit_client_provider'))
  await codemods.registerMiddleware('router', [{ path: '@dudousxd/adonis-authkit-client/authkit_middleware' }])
  await codemods.defineEnvValidations({
    leadingComment: 'Variáveis do @dudousxd/adonis-authkit-client (OIDC client)',
    variables: {
      AUTHKIT_ISSUER: `Env.schema.string({ format: 'url', tld: false })`,
      AUTHKIT_CLIENT_ID: `Env.schema.string()`,
      AUTHKIT_CLIENT_SECRET: `Env.schema.string.optional()`,
      AUTHKIT_REDIRECT_URI: `Env.schema.string({ format: 'url', tld: false })`,
    },
  })
}
