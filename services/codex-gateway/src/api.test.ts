import { describe, expect, it, vi } from 'vitest'
import { createCodexGatewayHandler } from './api.ts'
import type { SessionDetail, ThreadBackend } from './thread-backend.ts'

function createDetail(threadId: string, title = 'Session'): SessionDetail {
  return {
    threadId,
    title,
    preview: '',
    updatedAt: Date.now(),
    status: 'idle',
    messages: [],
  }
}

function createBackend(detail: SessionDetail): ThreadBackend {
  return {
    listThreads: vi.fn(async () => [{
      id: detail.threadId,
      title: detail.title,
      preview: detail.preview,
      updatedAt: detail.updatedAt,
      status: detail.status,
    }]),
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
}

describe('codex gateway handler', () => {
  it('activates a selected thread', async () => {
    const detail = createDetail('thread-1')
    const backend = createBackend(detail)
    let activeThreadId: string | null = null
    const handler = createCodexGatewayHandler({
      backend,
      getActiveThreadId: () => activeThreadId,
      setActiveThreadId: (threadId) => {
        activeThreadId = threadId
      },
      apiKey: 'devdev',
      workspacePath: '/workspace',
    })

    const response = await handler(new Request('http://localhost/api/threads/thread-1/activate', {
      method: 'POST',
      headers: { 'x-agent-terminal-key': 'devdev' },
    }))

    expect(response.status).toBe(200)
    expect(activeThreadId).toBe('thread-1')
    await expect(response.json()).resolves.toEqual({ threadId: 'thread-1' })
  })

  it('routes voice entry to the active thread only', async () => {
    const detail = createDetail('thread-2')
    const backend = createBackend(detail)
    let activeThreadId: string | null = 'thread-2'
    const handler = createCodexGatewayHandler({
      backend,
      getActiveThreadId: () => activeThreadId,
      setActiveThreadId: (threadId) => {
        activeThreadId = threadId
      },
      voiceEntryToken: 'devvoice',
      workspacePath: '/workspace',
    })

    const response = await handler(new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer devvoice',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'user', content: 'fix this thread only' },
        ],
      }),
    }))

    expect(response.status).toBe(200)
    expect(backend.startTurn).toHaveBeenCalledWith('thread-2', 'fix this thread only', 'reply')
    await expect(response.json()).resolves.toMatchObject({
      choices: [
        {
          message: {
            content: 'Sent to Session.',
          },
        },
      ],
      thread: {
        id: 'thread-2',
        turn_started: true,
      },
    })
  })

  it('streams audio chunks through the STT session endpoints', async () => {
    const detail = createDetail('thread-3')
    const backend = createBackend(detail)
    const stt = {
      startSession: vi.fn(() => ({ sessionId: 'stt-1' })),
      appendChunk: vi.fn(async () => ({ chunkCount: 1, byteLength: 4 })),
      finishSession: vi.fn(async () => ({
        transcript: 'draft from audio',
        chunkCount: 1,
        byteLength: 4,
      })),
    }
    let activeThreadId: string | null = null
    const handler = createCodexGatewayHandler({
      backend,
      stt,
      getActiveThreadId: () => activeThreadId,
      setActiveThreadId: (threadId) => {
        activeThreadId = threadId
      },
      apiKey: 'devdev',
      workspacePath: '/workspace',
    })

    const startResponse = await handler(new Request('http://localhost/api/stt/sessions', {
      method: 'POST',
      headers: { 'x-agent-terminal-key': 'devdev' },
    }))
    expect(startResponse.status).toBe(201)
    await expect(startResponse.json()).resolves.toEqual({ sessionId: 'stt-1' })

    const chunkResponse = await handler(new Request('http://localhost/api/stt/sessions/stt-1/chunks', {
      method: 'POST',
      headers: {
        'x-agent-terminal-key': 'devdev',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audioPcm: [1, 2, 3, 4] }),
    }))
    expect(chunkResponse.status).toBe(202)
    await expect(chunkResponse.json()).resolves.toEqual({
      ok: true,
      chunkCount: 1,
      byteLength: 4,
    })

    const finishResponse = await handler(new Request('http://localhost/api/stt/sessions/stt-1/finish', {
      method: 'POST',
      headers: { 'x-agent-terminal-key': 'devdev' },
    }))
    expect(finishResponse.status).toBe(200)
    await expect(finishResponse.json()).resolves.toEqual({
      transcript: 'draft from audio',
      chunkCount: 1,
      byteLength: 4,
    })
  })

  it('accepts binary audio chunks for the STT session endpoint', async () => {
    const detail = createDetail('thread-4')
    const backend = createBackend(detail)
    const stt = {
      startSession: vi.fn(() => ({ sessionId: 'stt-2' })),
      appendChunk: vi.fn(async () => ({ chunkCount: 1, byteLength: 4 })),
      finishSession: vi.fn(async () => ({
        transcript: 'draft from binary audio',
        chunkCount: 1,
        byteLength: 4,
      })),
    }
    const handler = createCodexGatewayHandler({
      backend,
      stt,
      getActiveThreadId: () => null,
      setActiveThreadId: () => {},
      apiKey: 'devdev',
      workspacePath: '/workspace',
    })

    await handler(new Request('http://localhost/api/stt/sessions', {
      method: 'POST',
      headers: { 'x-agent-terminal-key': 'devdev' },
    }))

    const chunkResponse = await handler(new Request('http://localhost/api/stt/sessions/stt-2/chunks', {
      method: 'POST',
      headers: {
        'x-agent-terminal-key': 'devdev',
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array([1, 2, 3, 4]),
      duplex: 'half',
    }))

    expect(chunkResponse.status).toBe(202)
    await expect(chunkResponse.json()).resolves.toEqual({
      ok: true,
      chunkCount: 1,
      byteLength: 4,
    })
  })

  it('passes the requested STT language through the session lifecycle', async () => {
    const detail = createDetail('thread-5')
    const backend = createBackend(detail)
    const transcribeAudio = vi.fn(async ({ language }: { language?: string }) => language ?? '')
    const { createSttSessionService } = await import('./stt-service.ts')
    const handler = createCodexGatewayHandler({
      backend,
      stt: createSttSessionService({ transcribeAudio }),
      getActiveThreadId: () => null,
      setActiveThreadId: () => {},
      apiKey: 'devdev',
      workspacePath: '/workspace',
    })

    const startResponse = await handler(new Request('http://localhost/api/stt/sessions', {
      method: 'POST',
      headers: {
        'x-agent-terminal-key': 'devdev',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'ja' }),
    }))
    const { sessionId } = await startResponse.json() as { sessionId: string }

    await handler(new Request(`http://localhost/api/stt/sessions/${sessionId}/chunks`, {
      method: 'POST',
      headers: {
        'x-agent-terminal-key': 'devdev',
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array([1, 2, 3, 4]),
      duplex: 'half',
    }))

    const finishResponse = await handler(new Request(`http://localhost/api/stt/sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: { 'x-agent-terminal-key': 'devdev' },
    }))

    expect(transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja' }))
    await expect(finishResponse.json()).resolves.toMatchObject({ transcript: 'ja' })
  })
})
