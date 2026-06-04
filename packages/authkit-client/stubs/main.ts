import { fileURLToPath } from 'node:url'
export const stubsRoot = fileURLToPath(new URL('./', import.meta.url))
