import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import type { Plugin } from 'vite'
import type { PluginContext } from './types'

export default function appServer(ctx: PluginContext): Plugin | null {
  const selectedApp = process.env.VITE_APP_NAME ?? process.env.APP_NAME ?? ''
  const appDir = ctx.externalApps[selectedApp]
  if (!appDir) return null

  const serverDir = resolve(appDir, 'server')
  if (!existsSync(resolve(serverDir, 'package.json'))) return null

  return {
    name: 'app-server',
    configureServer() {
      const requestedPort = process.env.AGENT_TERMINAL_SERVER_PORT ?? process.env.APP_SERVER_PORT ?? '8787'
      console.log(`[app-server] Starting ${selectedApp} server from ${serverDir}`)
      const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
      const args = process.platform === 'win32' ? ['/c', 'npm', 'run', 'dev'] : ['run', 'dev']
      const child = spawn(command, args, {
        cwd: serverDir,
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          PORT: requestedPort,
        },
      })
      child.on('error', (err) => {
        console.error(`[app-server] Failed to start: ${err.message}`)
      })
      process.on('exit', () => child.kill())
    },
  }
}
