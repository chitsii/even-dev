const GATEWAY_STORAGE_KEY = 'agent-terminal.remote-gateway-url'
const GATEWAY_TOKEN_STORAGE_KEY = 'agent-terminal.remote-gateway-token'
const ENV_GATEWAY_URL = import.meta.env.VITE_AGENT_TERMINAL_REMOTE_GATEWAY_URL ?? ''
const ENV_GATEWAY_TOKEN = import.meta.env.VITE_AGENT_TERMINAL_REMOTE_GATEWAY_TOKEN ?? ''

function normalizeGatewayUrl(rawValue: string | null | undefined): string {
  const trimmed = (rawValue ?? '').trim()
  if (!trimmed) {
    return ''
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlash.endsWith('/api') || withoutTrailingSlash.endsWith('/__agent_terminal_api')) {
    return withoutTrailingSlash
  }

  return `${withoutTrailingSlash}/api`
}

export function getRemoteGatewayUrl(): string {
  if (typeof window === 'undefined') {
    return normalizeGatewayUrl(ENV_GATEWAY_URL)
  }

  const params = new URLSearchParams(window.location.search)
  const queryGatewayUrl = params.get('gateway')
  if (queryGatewayUrl) {
    return normalizeGatewayUrl(queryGatewayUrl)
  }

  const storedGatewayUrl = window.localStorage.getItem(GATEWAY_STORAGE_KEY)
  if (storedGatewayUrl) {
    return normalizeGatewayUrl(storedGatewayUrl)
  }

  return normalizeGatewayUrl(ENV_GATEWAY_URL)
}

export function saveRemoteGatewayUrl(rawValue: string): string {
  const normalized = normalizeGatewayUrl(rawValue)
  if (typeof window !== 'undefined') {
    if (normalized) {
      window.localStorage.setItem(GATEWAY_STORAGE_KEY, normalized)
    } else {
      window.localStorage.removeItem(GATEWAY_STORAGE_KEY)
    }
  }
  return normalized
}

export function clearRemoteGatewayUrl(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(GATEWAY_STORAGE_KEY)
  }
}

export function getRemoteGatewayToken(): string {
  if (typeof window === 'undefined') {
    return ENV_GATEWAY_TOKEN.trim()
  }

  const params = new URLSearchParams(window.location.search)
  const queryToken = params.get('gatewayToken')
  if (queryToken) {
    return queryToken.trim()
  }

  return (window.localStorage.getItem(GATEWAY_TOKEN_STORAGE_KEY) ?? ENV_GATEWAY_TOKEN).trim()
}

export function saveRemoteGatewayToken(rawValue: string): string {
  const normalized = rawValue.trim()
  if (typeof window !== 'undefined') {
    if (normalized) {
      window.localStorage.setItem(GATEWAY_TOKEN_STORAGE_KEY, normalized)
    } else {
      window.localStorage.removeItem(GATEWAY_TOKEN_STORAGE_KEY)
    }
  }
  return normalized
}

export function clearRemoteGatewayToken(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(GATEWAY_TOKEN_STORAGE_KEY)
  }
}

export function describeGatewayUrl(remoteGatewayUrl: string, remoteGatewayToken: string): string {
  if (!remoteGatewayUrl) {
    return 'Embedded dev server / local mock fallback'
  }

  const tokenLabel = remoteGatewayToken ? 'token protected' : 'no token'
  return `Remote gateway: ${remoteGatewayUrl} (${tokenLabel})`
}
