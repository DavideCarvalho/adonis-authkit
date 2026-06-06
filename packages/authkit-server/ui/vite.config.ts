import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// The base will be rewritten at serving time from /__AUTHKIT_BASE__/ to the actual adminBase.
// We use a placeholder so all asset URLs are root-relative and can be rewritten by the shell controller.
export default defineConfig({
  plugins: [react()],
  base: '/__AUTHKIT_BASE__/',
  build: {
    // tsconfig do server tem rootDir './', então admin_shell_controller.ts compila
    // para build/src/host/admin_console/ — seu `../../host/ui-dist` resolve para
    // build/src/host/ui-dist. O dist do Vite PRECISA cair aí (não em build/host/ui-dist),
    // senão o serving cai no fallback "Build Required". Ver admin_shell_controller.ts.
    outDir: resolve(__dirname, '../build/src/host/ui-dist'),
    emptyOutDir: true,
  },
})
