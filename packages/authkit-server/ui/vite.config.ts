import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// The base will be rewritten at serving time from /__AUTHKIT_BASE__/ to the actual adminBase.
// We use a placeholder so all asset URLs are root-relative and can be rewritten by the shell controller.
export default defineConfig({
  plugins: [react()],
  base: '/__AUTHKIT_BASE__/',
  build: {
    outDir: resolve(__dirname, '../build/host/ui-dist'),
    emptyOutDir: true,
  },
})
