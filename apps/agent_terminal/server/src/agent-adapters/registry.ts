import type { AgentAdapter, AgentKind } from './types'

export class AgentAdapterRegistry {
  private readonly adapters = new Map<AgentKind, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.kind, adapter)
  }

  get(kind: AgentKind): AgentAdapter {
    const adapter = this.adapters.get(kind)
    if (!adapter) {
      throw new Error(`Missing adapter: ${kind}`)
    }
    return adapter
  }
}
