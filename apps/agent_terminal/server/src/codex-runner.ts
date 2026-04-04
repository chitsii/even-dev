import type { AgentAdapter, AgentEvent, AgentPrompt } from './agent-adapters/types'

export async function runAgentPrompt(
  adapter: AgentAdapter,
  workspacePath: string,
  prompt: AgentPrompt,
): Promise<{ text: string; events: AgentEvent[]; error: string | null }> {
  const runtime = await adapter.createSession({
    kind: adapter.kind,
    workspacePath,
  })
  const events: AgentEvent[] = []
  let finalText = ''
  let error: string | null = null

  const unsubscribe = runtime.subscribe((event) => {
    events.push(event)
    if (event.type === 'message') {
      finalText = event.text
    } else if (event.type === 'summary' && !finalText) {
      finalText = event.text
    } else if (event.type === 'final' && !finalText) {
      finalText = event.text
    }
    if (event.type === 'error') {
      error = event.message
    }
  })

  try {
    await runtime.dispatch({
      type: 'send-prompt',
      prompt,
    })
  } finally {
    unsubscribe()
    await runtime.close()
  }

  return {
    text: finalText,
    events,
    error,
  }
}
