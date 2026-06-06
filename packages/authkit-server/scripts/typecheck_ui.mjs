/**
 * Run TypeScript type-check on the ui/ SPA (separate tsconfig, no emit).
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uiDir = resolve(__dirname, '../ui')

if (!existsSync(uiDir)) {
  process.exit(0)
}

console.log('[typecheck_ui] Type-checking AuthKit Admin Console SPA…')

try {
  execSync('npx tsc --noEmit', {
    cwd: uiDir,
    stdio: 'inherit',
  })
  console.log('[typecheck_ui] OK')
} catch (err) {
  console.error('[typecheck_ui] Type errors found')
  process.exit(1)
}
