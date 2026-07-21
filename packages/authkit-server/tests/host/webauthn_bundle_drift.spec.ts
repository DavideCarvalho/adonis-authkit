/**
 * O bundle do WebAuthn é um artefato COMMITADO (`src/host/assets/webauthn.js`),
 * então um bump do `@simplewebauthn/browser` no lockfile não regenera o arquivo
 * servido: o pacote passaria a declarar uma versão e servir outra, em silêncio.
 *
 * O `scripts/check_webauthn_bundle.mjs` existe para travar exatamente isso. Ele
 * roda no CI, e não aqui — regenerar o bundle a cada suíte seria caro e exigiria
 * git. O que estes testes protegem é o CABEAMENTO: o check pode ser removido do
 * `package.json` ou do workflow sem quebrar teste nenhum, e aí o drift volta a
 * passar despercebido — que é o problema original.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@japa/runner';

const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const scriptPath = fileURLToPath(
  new URL('../../scripts/check_webauthn_bundle.mjs', import.meta.url),
);
const buildScriptPath = fileURLToPath(new URL('../../scripts/build_webauthn.mjs', import.meta.url));
const ciPath = fileURLToPath(new URL('../../../../.github/workflows/ci.yml', import.meta.url));

const SCRIPT_NAME = 'check:webauthn-bundle';

test.group('webauthn bundle — check de drift', () => {
  test('o script de check existe', ({ assert }) => {
    assert.isTrue(existsSync(scriptPath), 'scripts/check_webauthn_bundle.mjs sumiu');
  });

  test('o package.json expõe o check como script', ({ assert }) => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.equal(pkg.scripts[SCRIPT_NAME], 'node scripts/check_webauthn_bundle.mjs');
  });

  test('o CI roda o check', ({ assert }) => {
    const ci = readFileSync(ciPath, 'utf-8');
    assert.include(
      ci,
      'check:webauthn-bundle',
      'o workflow de CI não invoca mais o check de drift do bundle',
    );
  });

  /**
   * O check só é confiável se o build for reproduzível a partir da dependência
   * instalada — se o `build_webauthn.mjs` passar a ler de qualquer outra fonte,
   * o `git diff` deixa de significar "defasado em relação ao lockfile".
   */
  test('o build do bundle sai do @simplewebauthn/browser instalado', ({ assert }) => {
    const source = readFileSync(buildScriptPath, 'utf-8');
    assert.include(source, "from '@simplewebauthn/browser'");
    assert.include(source, 'src/host/assets');
  });

  test('o build_webauthn documenta que o artefato é commitado de propósito', ({ assert }) => {
    const source = readFileSync(buildScriptPath, 'utf-8');
    assert.include(source, 'check_webauthn_bundle.mjs');
    assert.include(source, 'COMMITADO');
  });
});
