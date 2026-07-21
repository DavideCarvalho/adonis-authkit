/**
 * Empacota o `@simplewebauthn/browser` num único bundle ESM servido pelo
 * próprio host-kit, em `src/host/assets/webauthn.js`.
 *
 * Substitui o import de CDN público (cdn.jsdelivr.net) que as views de login,
 * MFA challenge, account/mfa e account/confirm faziam. O CDN colocava um
 * terceiro no caminho de autenticação, quebrava silenciosamente sob CSP
 * `script-src 'self'` e tornava o login inutilizável offline / em rede fechada.
 *
 * O bundle gerado é COMMITADO, mesma decisão de `build_host_css.mjs`: assim o
 * pacote funciona tanto a partir de `src/` (dev, testes) quanto de `build/`
 * (publicado no npm) sem passo extra. O `package.json` `build` copia
 * `src/host/assets` → `build/src/host/assets` junto dos demais assets.
 *
 * O preço de commitar um artefato é o drift: um bump do `@simplewebauthn/browser`
 * no lockfile muda a versão DECLARADA sem regenerar o arquivo SERVIDO, e ninguém
 * percebe. Por isso existe o `check_webauthn_bundle.mjs` — ele regenera e falha
 * se o commitado divergir da dependência instalada. Roda no CI; não mexa neste
 * script sem rodar `pnpm --filter @adonis-agora/authkit-server build:webauthn`
 * e commitar o `src/host/assets/webauthn.js` resultante.
 *
 * Usa o esbuild que já vem com o `vite` (devDependency) — é um bundle trivial,
 * não precisa da pipeline do Vite.
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

const outDir = join(root, 'src/host/assets');
const outfile = join(outDir, 'webauthn.js');

mkdirSync(outDir, { recursive: true });

const esbuild = require('esbuild');

/**
 * `entryPoints` com `stdin` para reexportar só a superfície que as views usam.
 * Um `export *` do pacote inteiro traria o mesmo bundle — o pacote é pequeno e
 * não tem side-effects — mas ser explícito documenta o contrato: se uma view
 * passar a importar outro símbolo, o build quebra alto em vez de servir um
 * `undefined` em produção.
 */
await esbuild.build({
  stdin: {
    contents: `export {
      startAuthentication,
      startRegistration,
      browserSupportsWebAuthn,
      browserSupportsWebAuthnAutofill,
      platformAuthenticatorIsAvailable,
      WebAuthnAbortService,
      WebAuthnError,
    } from '@simplewebauthn/browser'\n`,
    resolveDir: root,
    sourcefile: 'authkit-webauthn-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  outfile,
});

/**
 * O `@simplewebauthn/browser` não expõe `./package.json` no campo `exports`,
 * então resolvemos o entry e subimos até o package.json mais próximo só para
 * logar a versão empacotada (o bundle é commitado — saber a versão que gerou
 * o arquivo é o que torna o diff revisável).
 */
let version = 'desconhecida';
try {
  let dir = dirname(require.resolve('@simplewebauthn/browser'));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    // `script/package.json` e `esm/package.json` existem só para fixar o
    // `type` do diretório e NÃO têm `version` — seguir subindo até o manifesto
    // real do pacote.
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (parsed.version) {
        version = parsed.version;
        break;
      }
    }
    dir = dirname(dir);
  }
} catch {
  // Best-effort: nunca quebra o build por causa do log.
}

const size = statSync(outfile).size;
console.log(
  `webauthn bundle: @simplewebauthn/browser@${version} → ` +
    `src/host/assets/webauthn.js (${(size / 1024).toFixed(1)} KB)`,
);
