import { defineConfig } from 'vite'
// Re-export the shared factory with the web target so this file can be used
// standalone: `vite --config vite.web.config.ts` (port 5174, dist-web/, no PWA).
import { createViteConfig } from './vite.config'

/** Web shell config — browser build (port 5174, no service worker). */
export default defineConfig(createViteConfig('web'))
