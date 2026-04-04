import { defineConfig } from 'vite'
import { createStandaloneViteConfig } from '../_shared/standalone-vite'

const baseConfig = createStandaloneViteConfig(import.meta.url, 5178)
const serverPort = process.env.AGENT_TERMINAL_SERVER_PORT ?? '8787'

export default defineConfig({
  ...baseConfig,
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
