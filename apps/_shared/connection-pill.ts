export type ConnectionPillPhase = 'idle' | 'connecting' | 'connected' | 'mock' | 'running' | 'error'

const PHASE_CONFIG: Record<ConnectionPillPhase, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'is-ready' },
  connecting: { label: 'Connecting', className: 'is-connecting' },
  connected: { label: 'Connected', className: 'is-connected' },
  mock: { label: 'Mock Mode', className: 'is-mock' },
  running: { label: 'Running', className: 'is-running' },
  error: { label: 'Attention', className: 'is-error' },
}

export function applyConnectionPillPhase(pill: HTMLDivElement, phase: ConnectionPillPhase): void {
  const config = PHASE_CONFIG[phase]
  pill.textContent = config.label
  pill.className = `hero-pill ${config.className}`
}

export function inferConnectionPillPhaseFromStatus(statusText: string): ConnectionPillPhase | null {
  const normalized = statusText.trim().toLowerCase()

  if (!normalized) return null
  if (normalized.includes('connecting')) return 'connecting'
  if (normalized.includes('bridge not found') || normalized.includes('bridge unavailable')) return 'mock'
  if (normalized.includes('mock mode') || normalized.includes('browser mode')) return 'mock'
  if (normalized.includes('failed') || normalized.includes('error')) return 'error'
  if (normalized.includes('connected')) return 'connected'
  if (normalized.includes('ready')) return 'idle'

  return null
}
