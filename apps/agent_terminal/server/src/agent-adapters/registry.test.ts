import { describe, expect, it } from 'vitest'
import { AgentAdapterRegistry } from './registry'
import { createMockAgentAdapter } from './mock'

describe('AgentAdapterRegistry', () => {
  it('returns a registered adapter by kind', () => {
    const registry = new AgentAdapterRegistry()
    const adapter = createMockAgentAdapter('codex')

    registry.register(adapter)

    expect(registry.get('codex')).toBe(adapter)
  })

  it('throws when the adapter is missing', () => {
    const registry = new AgentAdapterRegistry()

    expect(() => registry.get('claude-code')).toThrowError('Missing adapter: claude-code')
  })
})

describe('mock agent adapter', () => {
  it('emits discussion and implementation events', async () => {
    const adapter = createMockAgentAdapter('codex')
    const runtime = await adapter.createSession({
      kind: 'codex',
      workspacePath: 'C:/workspace/demo',
    })
    const events: string[] = []

    const unsubscribe = runtime.subscribe((event) => {
      events.push(event.type === 'status' ? `${event.type}:${event.phase}` : event.type)
    })

    await runtime.dispatch({
      type: 'send-prompt',
      prompt: {
        mode: 'discuss',
        text: 'Sketch a design for an agent terminal app.',
      },
    })

    await runtime.dispatch({
      type: 'send-prompt',
      prompt: {
        mode: 'implement',
        text: 'Implement the approved design.',
      },
    })

    unsubscribe()
    await runtime.close()

    expect(events).toEqual([
      'status:thinking',
      'message',
      'final',
      'status:editing',
      'file-change',
      'summary',
      'status:testing',
      'status:done',
      'final',
    ])
  })
})
