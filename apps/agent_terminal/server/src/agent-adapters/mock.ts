import type {
  AgentAction,
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentKind,
  AgentRuntime,
  AgentSessionConfig,
} from './types'

const mockCapabilities: AgentCapabilities = {
  supportsApproval: false,
  supportsInterrupt: true,
  supportsStructuredFileChanges: true,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function makeDiscussionText(promptText: string): string {
  return [
    'Discussion Response',
    '',
    `You said: ${promptText}`,
    '',
    'Direction',
    '- Keep Draft, Discuss, and Implement as separate modes so the user never loses context.',
    '- Preserve the full answer in raw text and wrap it only when rendering to the glasses viewport.',
    '- Use push-to-talk later, but keep the editing model segment based from the start.',
    '',
    'Implementation Outline',
    '1. Capture short voice segments as editable draft cards.',
    '2. Send the merged draft to an adapter-backed agent runtime.',
    '3. Render the full reply in a scrollable discuss viewport.',
    '4. Move to implement mode only after the user approves the direction.',
    '',
    'Scrolling Note',
    'This mock response is intentionally long so the discuss view has to paginate the visible lines on the glasses. The browser surface mirrors that same viewport and lets the tests verify that scrolling changes the rendered window without mutating the original raw text.',
  ].join('\n')
}

class MockAgentRuntime implements AgentRuntime {
  readonly sessionId: string
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private readonly config: AgentSessionConfig

  constructor(config: AgentSessionConfig) {
    this.config = config
    this.sessionId = `mock-${config.kind}-${Date.now()}`
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async dispatch(action: AgentAction): Promise<void> {
    if (action.type !== 'send-prompt') {
      if (action.type === 'interrupt') {
        this.emit({ type: 'status', phase: 'idle', message: 'Interrupted' })
      }
      return
    }

    if (action.prompt.mode === 'discuss') {
      this.emit({ type: 'status', phase: 'thinking', message: `Planning in ${this.config.workspacePath}` })
      this.emit({ type: 'message', mode: 'discuss', text: makeDiscussionText(action.prompt.text) })
      this.emit({ type: 'final', text: 'Discuss response complete.' })
      return
    }

    this.emit({ type: 'status', phase: 'editing', message: 'Editing Draft / Discuss / Implement flow' })
    await sleep(100)
    this.emit({ type: 'file-change', path: 'src/agent-app.ts' })
    await sleep(100)
    this.emit({ type: 'summary', text: 'Created the first browser-facing agent terminal prototype.' })
    await sleep(100)
    this.emit({ type: 'status', phase: 'testing', message: 'Running browser and adapter tests' })
    await sleep(100)
    this.emit({ type: 'status', phase: 'done', message: 'Prototype ready for review' })
    this.emit({ type: 'final', text: 'Implementation complete.' })
  }

  async close(): Promise<void> {
    this.listeners.clear()
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

export function createMockAgentAdapter(kind: AgentKind): AgentAdapter {
  return {
    kind,
    capabilities: mockCapabilities,
    async createSession(config: AgentSessionConfig): Promise<AgentRuntime> {
      return new MockAgentRuntime(config)
    },
  }
}
