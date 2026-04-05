import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readArgs(argv) {
  const args = {
    gatewayUrl: '',
    packageId: '',
    gatewayToken: '',
    strictNetworkWhitelist: false,
    omitNetworkWhitelist: false,
    emptyNetworkWhitelist: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--gateway-url') {
      args.gatewayUrl = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (value === '--package-id') {
      args.packageId = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (value === '--gateway-token') {
      args.gatewayToken = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (value === '--strict-network-whitelist') {
      args.strictNetworkWhitelist = true
      continue
    }
    if (value === '--omit-network-whitelist') {
      args.omitNetworkWhitelist = true
      continue
    }
    if (value === '--empty-network-whitelist') {
      args.emptyNetworkWhitelist = true
    }
  }

  return args
}

function normalizeGatewayUrl(rawValue) {
  const trimmed = rawValue.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('Missing --gateway-url')
  }
  if (trimmed.endsWith('/api') || trimmed.endsWith('/__agent_terminal_api')) {
    return trimmed
  }
  return `${trimmed}/api`
}

function gatewayOriginFromUrl(gatewayUrl) {
  const parsed = new URL(gatewayUrl)
  return parsed.origin
}

const rootDir = resolve(import.meta.dirname, '..')
const appDir = resolve(rootDir, 'apps', 'agent_terminal')
const manifestPath = resolve(appDir, 'app.json')
const outputManifestPath = resolve(appDir, 'app.private.json')
const outputEnvPath = resolve(appDir, '.env.private-build.local')
const {
  gatewayUrl: rawGatewayUrl,
  packageId,
  gatewayToken,
  strictNetworkWhitelist,
  omitNetworkWhitelist,
  emptyNetworkWhitelist,
} = readArgs(process.argv.slice(2))

if (!packageId.trim()) {
  throw new Error('Missing --package-id')
}

const gatewayUrl = normalizeGatewayUrl(rawGatewayUrl)
const gatewayOrigin = gatewayOriginFromUrl(gatewayUrl)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const nextPermissions = Array.isArray(manifest.permissions) ? [...manifest.permissions] : []
const networkPermission = {
  name: 'network',
  desc: 'Connects to the remote Codex gateway that runs session storage and agent execution.',
}

if (emptyNetworkWhitelist || (!strictNetworkWhitelist && !omitNetworkWhitelist)) {
  networkPermission.whitelist = []
} else if (!omitNetworkWhitelist) {
  networkPermission.whitelist = [gatewayOrigin]
}

const filteredPermissions = nextPermissions.filter((permission) => permission?.name !== 'network')
filteredPermissions.push(networkPermission)

const privateManifest = {
  ...manifest,
  package_id: packageId.trim(),
  permissions: filteredPermissions,
}

writeFileSync(outputManifestPath, `${JSON.stringify(privateManifest, null, 2)}\n`, 'utf8')
writeFileSync(
  outputEnvPath,
  `VITE_AGENT_TERMINAL_REMOTE_GATEWAY_URL=${gatewayUrl}\nVITE_AGENT_TERMINAL_REMOTE_GATEWAY_TOKEN=${gatewayToken.trim()}\n`,
  'utf8',
)

console.log(`Wrote ${outputManifestPath}`)
console.log(`Wrote ${outputEnvPath}`)
console.log(
  omitNetworkWhitelist
    ? 'Network whitelist omitted from private manifest.'
    : emptyNetworkWhitelist || !strictNetworkWhitelist
      ? 'Network whitelist explicitly set to [].'
      : `Network whitelist: ${gatewayOrigin}`,
)
console.log('Next steps:')
console.log('  1. npm --prefix apps/agent_terminal run build:private')
console.log('  2. npx @evenrealities/evenhub-cli pack apps/agent_terminal/app.private.json apps/agent_terminal/dist -o apps/agent_terminal/agent-terminal-private.ehpk')
