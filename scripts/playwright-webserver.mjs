import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const [, , appDirArg, portArg] = process.argv

if (!appDirArg || !portArg) {
  console.error('Usage: node scripts/playwright-webserver.mjs <app-dir> <port>')
  process.exit(1)
}

const rootDir = process.cwd()
const appDir = resolve(rootDir, appDirArg)
const serverDir = resolve(appDir, 'server')
const port = String(portArg)
const appServerPort = String(Number(portArg) + 1000)
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmSpawnCommand = process.platform === 'win32' ? 'cmd.exe' : npmCmd
const viteBin = resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []

function packageHasDependencies(packageDir) {
  const packageJsonPath = resolve(packageDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return false
  }

  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const dependencies = Object.keys(parsed.dependencies ?? {})
  const devDependencies = Object.keys(parsed.devDependencies ?? {})
  return dependencies.length > 0 || devDependencies.length > 0
}

function ensureAppDependencies() {
  if (!packageHasDependencies(appDir)) {
    return
  }

  const appNodeModulesDir = resolve(appDir, 'node_modules')
  if (existsSync(appNodeModulesDir)) {
    return
  }

  console.log(`[playwright-webserver] Installing dependencies for ${appDirArg}...`)
  const result = spawnSync(npmCmd, ['install'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function ensureServerDependencies() {
  const serverPackageJson = resolve(serverDir, 'package.json')
  if (!existsSync(serverPackageJson)) {
    return
  }

  if (!packageHasDependencies(serverDir)) {
    return
  }

  const serverNodeModulesDir = resolve(serverDir, 'node_modules')
  if (existsSync(serverNodeModulesDir)) {
    return
  }

  console.log(`[playwright-webserver] Installing server dependencies for ${appDirArg}...`)
  const result = spawnSync(npmCmd, ['install'], {
    cwd: serverDir,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

ensureAppDependencies()
ensureServerDependencies()

if (existsSync(resolve(serverDir, 'package.json'))) {
  const serverChild = spawn(
    npmSpawnCommand,
    process.platform === 'win32' ? ['/c', 'npm', 'run', 'dev'] : ['run', 'dev'],
    {
    cwd: serverDir,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      PORT: appServerPort,
      AGENT_TERMINAL_SERVER_PORT: appServerPort,
      ...(appDirArg.endsWith('agent_terminal') ? { AGENT_TERMINAL_USE_MOCK_AGENT: '1' } : {}),
    },
  })
  children.push(serverChild)
}

const child = spawn(process.execPath, [viteBin, '--host', '0.0.0.0', '--port', port], {
  cwd: appDir,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    AGENT_TERMINAL_SERVER_PORT: appServerPort,
  },
})
children.push(child)

child.on('exit', (code, signal) => {
  for (const currentChild of children) {
    if (currentChild !== child && !currentChild.killed) {
      currentChild.kill()
    }
  }
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

process.on('exit', () => {
  for (const currentChild of children) {
    if (!currentChild.killed) {
      currentChild.kill()
    }
  }
})
