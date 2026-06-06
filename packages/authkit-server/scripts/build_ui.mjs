/**
 * Build script for the AuthKit Admin Console React SPA.
 * Runs `vite build` inside the `ui/` directory.
 * Output goes to `build/host/ui-dist/` (configured in ui/vite.config.ts).
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uiDir = resolve(__dirname, '../ui')

if (!existsSync(uiDir)) {
  console.error('[build_ui] ui/ directory not found — skipping SPA build')
  process.exit(0)
}

console.log('[build_ui] Building AuthKit Admin Console SPA…')

try {
  execSync('npx vite build', {
    cwd: uiDir,
    stdio: 'inherit',
  })
  console.log('[build_ui] SPA build complete — output in build/host/ui-dist/')
} catch (err) {
  console.error('[build_ui] Vite build failed:', err.message)
  process.exit(1)
}
