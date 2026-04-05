import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createStandaloneViteConfig } from '../_shared/standalone-vite'

const baseConfig = createStandaloneViteConfig(import.meta.url, 5178)
const serverPort = process.env.AGENT_TERMINAL_SERVER_PORT ?? '8787'

export default defineConfig({
  plugins: [react({ fastRefresh: false })],
  ...baseConfig,
  esbuild: {
    target: 'es2019',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2019',
    },
  },
  build: {
    ...baseConfig.build,
    target: 'es2019',
  },
  server: {
    ...baseConfig.server,
    proxy: {
      '/__agent_terminal_api': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
})
