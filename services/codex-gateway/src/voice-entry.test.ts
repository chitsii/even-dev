import { describe, expect, it, vi } from 'vitest'
import {
  createVoiceEntryChatCompletion,
  extractLatestUserText,
  runVoiceEntryCommand,
} from './voice-entry.ts'
import type { SessionDetail, ThreadBackend } from './thread-backend.ts'

function createDetail(id: string, title: string): SessionDetail {
  return {
    threadId: id,
    title,
    preview: '',
    updatedAt: Date.now(),
    status: 'idle',
    messages: [],
  }
}

describe('voice-entry helpers', () => {
  it('extracts the latest user text from chat completion messages', () => {
    expect(extractLatestUserText({
      messages: [
        { role: 'assistant', content: 'ignore' },
        { role: 'user', content: ' first ' },
        { role: 'user', content: [{ type: 'text', text: 'second' }] },
      ],
    })).toBe('second')
  })

  it('sends voice entry text to the active thread', async () => {
    const detail = createDetail('thread-1', 'Session')
    const backend: ThreadBackend = {
      listThreads: vi.fn(async () => []),
      createThread: vi.fn(async () => detail),
      readThread: vi.fn(async () => detail),
      resumeThread: vi.fn(async () => detail),
      startTurn: vi.fn(async () => ({ threadId: detail.threadId, turnId: 'turn-1' })),
      interruptTurn: vi.fn(async () => true),
      getRuntime: vi.fn(() => ({
        threadId: detail.threadId,
        running: false,
        turnId: null,
        status: 'idle',
        lastAgentText: '',
        events: [],
        error: null,
      })),
      subscribe: vi.fn(() => () => {}),
    }

    const result = await runVoiceEntryCommand(backend, 'thread-1', 'fix the tests')
    expect(backend.resumeThread).toHaveBeenCalledWith('thread-1')
    expect(backend.startTurn).toHaveBeenCalledWith('thread-1', 'fix the tests', 'reply')
    expect(result.turnStarted).toBe(true)
  })

  it('returns a short error when no active thread is selected', async () => {
    const detail = createDetail('thread-2', 'Latest')
    const backend: ThreadBackend = {
      listThreads: vi.fn(async () => []),
      createThread: vi.fn(async () => detail),
      readThread: vi.fn(async () => detail),
      resumeThread: vi.fn(async () => detail),
      startTurn: vi.fn(async () => ({ threadId: detail.threadId, turnId: 'turn-2' })),
      interruptTurn: vi.fn(async () => true),
      getRuntime: vi.fn(() => ({
        threadId: detail.threadId,
        running: false,
        turnId: null,
        status: 'idle',
        lastAgentText: '',
        events: [],
        error: null,
      })),
      subscribe: vi.fn(() => () => {}),
    }

    const result = await runVoiceEntryCommand(backend, null, 'continue')
    expect(backend.startTurn).not.toHaveBeenCalled()
    expect(result.turnStarted).toBe(false)
    expect(result.replyText).toBe('No active session selected.')
    expect(result.detail).toBeNull()
  })

  it('returns a ready message when no text is provided', async () => {
    const detail = createDetail('thread-2', 'Latest')
    const backend: ThreadBackend = {
      listThreads: vi.fn(async () => []),
      createThread: vi.fn(async () => detail),
      readThread: vi.fn(async () => detail),
      resumeThread: vi.fn(async () => detail),
      startTurn: vi.fn(async () => ({ threadId: detail.threadId, turnId: 'turn-2' })),
      interruptTurn: vi.fn(async () => true),
      getRuntime: vi.fn(() => ({
        threadId: detail.threadId,
        running: false,
        turnId: null,
        status: 'idle',
        lastAgentText: '',
        events: [],
        error: null,
      })),
      subscribe: vi.fn(() => () => {}),
    }

    const result = await runVoiceEntryCommand(backend, 'thread-2', '')
    expect(backend.resumeThread).toHaveBeenCalledWith('thread-2')
    expect(backend.startTurn).not.toHaveBeenCalled()
    expect(result.turnStarted).toBe(false)
    expect(result.replyText).toBe('Ready for Latest.')
  })

  it('creates an OpenAI-style chat completion payload', () => {
    const payload = createVoiceEntryChatCompletion(
      { model: 'gpt-4.1-mini' },
      {
        detail: createDetail('thread-3', 'Session'),
        turnStarted: true,
        replyText: 'Sent to Session.',
      },
    )

    expect(payload).toMatchObject({
      object: 'chat.completion',
      model: 'gpt-4.1-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Sent to Session.',
          },
        },
      ],
      thread: {
        id: 'thread-3',
        turn_started: true,
      },
    })
  })
})
