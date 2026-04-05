import { describe, expect, it, vi } from 'vitest'
import { createCodexThreadBackend } from './codex-thread-backend.ts'

describe('codex thread backend runtime hydration', () => {
  it('hydrates active runtime from thread/read so interrupt can target the current turn', async () => {
    const client = {
      subscribe: vi.fn(),
      close: vi.fn(async () => {}),
      request: vi.fn(async (method: string) => {
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'thread-active',
              preview: 'preview',
              updatedAt: 1,
              status: { type: 'active', activeFlags: ['running'] },
              name: 'Thread Active',
              turns: [
                {
                  id: 'turn-123',
                  status: 'running',
                  error: null,
                  items: [
                    {
                      id: 'assistant-1',
                      type: 'agentMessage',
                      text: 'Still working',
                    },
                  ],
                },
              ],
            },
          }
        }
        if (method === 'turn/interrupt') {
          return {}
        }
        throw new Error(`Unexpected request: ${method}`)
      }),
    }

    const backend = createCodexThreadBackend({
      workspacePath: 'C:/workspace',
      client: client as never,
    })

    await backend.readThread('thread-active')
    const runtime = backend.getRuntime('thread-active')

    expect(runtime.running).toBe(true)
    expect(runtime.status).toBe('running')
    expect(runtime.turnId).toBe('turn-123')
    expect(runtime.lastAgentText).toBe('Still working')

    const interrupted = await backend.interruptTurn('thread-active')
    expect(interrupted).toBe(true)
    expect(client.request).toHaveBeenCalledWith('turn/interrupt', {
      threadId: 'thread-active',
      turnId: 'turn-123',
    })
  })
})
