/**
 * Trava o drift do bundle do WebAuthn.
 *
 * `src/host/assets/webauthn.js` é gerado por `build_webauthn.mjs` e COMMITADO
 * (ver o cabeçalho de lá para o porquê). O risco dessa escolha é silencioso: um
 * bump do `@simplewebauthn/browser` no lockfile atualiza a versão DECLARADA no
 * `package.json` sem regenerar o arquivo SERVIDO, e o pacote passa a anunciar
 * uma versão e entregar outra — inclusive quando o bump é justamente a correção
 * de uma CVE no caminho de autenticação.
 *
 * Este check regenera o bundle a partir da dependência instalada e falha se o
 * resultado divergir do que está commitado. Roda no CI (`.github/workflows/ci.yml`)
 * e localmente via `pnpm --filter @adonis-agora/authkit-server check:webauthn-bundle`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const relativePath = 'src/host/assets/webauthn.js';

// 1. Regenera o bundle a partir do @simplewebauthn/browser instalado.
const build = spawnSync(process.execPath, ['scripts/build_webauthn.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('\nFalha ao gerar o bundle do webauthn — veja o erro acima.');
  process.exit(build.status ?? 1);
}

// 2. Compara com o que está commitado. `HEAD` (e não o índice) porque o que
//    importa é o arquivo que vai ser publicado, esteja ou não já staged.
const diff = spawnSync('git', ['diff', '--exit-code', 'HEAD', '--', relativePath], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
});

if (diff.status === 0) {
  console.log(`\nOK: ${relativePath} está em dia com o @simplewebauthn/browser instalado.`);
  process.exit(0);
}

/**
 * Mesma subida de diretórios do `build_webauthn.mjs`: o `@simplewebauthn/browser`
 * não expõe `./package.json` no campo `exports`, então resolvemos o entry e
 * procuramos o manifesto real. Best-effort — o diff acima já é o sinal que
 * importa, a versão é só contexto para a mensagem.
 */
let installed = 'desconhecida';
try {
  let dir = dirname(require.resolve('@simplewebauthn/browser'));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (parsed.version) {
        installed = parsed.version;
        break;
      }
    }
    dir = dirname(dir);
  }
} catch {
  // Segue com 'desconhecida'.
}

console.error(
  `\nBundle do WebAuthn defasado: ${relativePath} não corresponde ao @simplewebauthn/browser instalado (${installed}).\n\nO arquivo é um artefato commitado de propósito, então um bump da dependência\nNÃO o regenera sozinho — sem este check, o pacote declararia uma versão e\nserviria outra, em silêncio.\n\nPara resolver, rode e commite o resultado:\n  pnpm --filter @adonis-agora/authkit-server build:webauthn\n  git add packages/authkit-server/${relativePath}\n`,
);
process.exit(1);
