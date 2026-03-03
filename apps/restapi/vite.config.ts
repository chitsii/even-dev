import { defineConfig } from 'vite'
import { createStandaloneViteConfig } from '../_shared/standalone-vite'
import restapiProxy from './vite-plugin'

export default defineConfig({
  ...createStandaloneViteConfig(import.meta.url, 5176),
  plugins: [restapiProxy()],
})
