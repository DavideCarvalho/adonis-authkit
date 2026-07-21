/**
 * Build script for the AuthKit Admin Console React SPA.
 * Runs `vite build` inside the `ui/` directory.
 * Output goes to `build/host/ui-dist/` (configured in ui/vite.config.ts).
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(__dirname, '../ui');

if (!existsSync(uiDir)) {
  console.error('[build_ui] ui/ directory not found — skipping SPA build');
  process.exit(0);
}

console.log('[build_ui] Building AuthKit Admin Console SPA…');

try {
  execSync('npx vite build', {
    cwd: uiDir,
    stdio: 'inherit',
  });
  console.log('[build_ui] SPA build complete');
} catch (err) {
  console.error('[build_ui] Vite build failed:', err.message);
  process.exit(1);
}

// Guard: o dist TEM que cair onde o admin_shell_controller compilado o lê
// (build/src/host/ui-dist/index.html — ver vite.config.ts). Se o outDir
// divergir, o serving cai no fallback "Build Required" em produção sem erro de
// build — exatamente o bug que isto previne. Falha o build alto e claro.
const expected = resolve(__dirname, '../build/src/host/ui-dist/index.html');
if (!existsSync(expected)) {
  console.error(
    `[build_ui] ERRO: dist não encontrado em ${expected}. O admin_shell_controller serviria o fallback. Verifique build.outDir em ui/vite.config.ts.`,
  );
  process.exit(1);
}
console.log('[build_ui] dist verificado em build/src/host/ui-dist/');
