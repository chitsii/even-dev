import { describe, expect, it, vi } from 'vitest'
import { createAgentTerminalHandler } from './api'
import { createMockThreadBackend } from './mock-thread-backend'
import { createSttSessionService } from './stt-service'

describe('createAgentTerminalHandler', () => {
  it('lists, creates, and resumes threads', async () => {
    const backend = createMockThreadBackend()
    const handler = createAgentTerminalHandler({ backend })

    const emptyResponse = await handler(new Request('http://local/api/threads'))
    const emptyPayload = await emptyResponse.json() as { threads: Array<{ id: string }> }
    expect(emptyPayload.threads).toEqual([])

    const createResponse = await handler(new Request('http://local/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Session Alpha' }),
    }))
    const createPayload = await createResponse.json() as { detail: { threadId: string; title: string } }
    expect(createPayload.detail.title).toBe('Session Alpha')

    const listResponse = await handler(new Request('http://local/api/threads'))
    const listPayload = await listResponse.json() as { threads: Array<{ id: string; title: string }> }
    expect(listPayload.threads).toHaveLength(1)
    expect(listPayload.threads[0]?.title).toBe('Session Alpha')

    const resumeResponse = await handler(new Request(`http://local/api/threads/${createPayload.detail.threadId}/resume`, {
      method: 'POST',
    }))
    const resumePayload = await resumeResponse.json() as { detail: { threadId: string; title: string } | null }
    expect(resumePayload.detail?.threadId).toBe(createPayload.detail.threadId)
  })

  it('starts turns and exposes runtime snapshots', async () => {
    const backend = createMockThreadBackend()
    const handler = createAgentTerminalHandler({ backend })

    const createResponse = await handler(new Request('http://local/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Reply Thread' }),
    }))
    const createPayload = await createResponse.json() as { detail: { threadId: string } }
    const threadId = createPayload.detail.threadId

    const turnResponse = await handler(new Request(`http://local/api/threads/${threadId}/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Continue this coding session.', mode: 'reply' }),
    }))
    expect(turnResponse.status).toBe(202)

    const runningResponse = await handler(new Request(`http://local/api/threads/${threadId}/runtime`))
    const runningPayload = await runningResponse.json() as { runtime: { running: boolean; status: string } }
    expect(runningPayload.runtime.running).toBe(true)
    expect(runningPayload.runtime.status).toBe('running')

    await new Promise((resolve) => setTimeout(resolve, 260))

    const detailResponse = await handler(new Request(`http://local/api/threads/${threadId}`))
    const detailPayload = await detailResponse.json() as {
      detail: { messages: Array<{ role: string; text: string }> }
    }
    expect(detailPayload.detail?.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(detailPayload.detail?.messages[1]?.text).toContain('Discussion Response')

    const finalRuntimeResponse = await handler(new Request(`http://local/api/threads/${threadId}/runtime`))
    const finalRuntimePayload = await finalRuntimeResponse.json() as {
      runtime: { running: boolean; status: string; lastAgentText: string }
    }
    expect(finalRuntimePayload.runtime.running).toBe(false)
    expect(finalRuntimePayload.runtime.status).toBe('completed')
    expect(finalRuntimePayload.runtime.lastAgentText).toContain('Discussion Response')
  })

  it('accepts implement turns and records runtime events', async () => {
    const backend = createMockThreadBackend()
    const handler = createAgentTerminalHandler({ backend })

    const createResponse = await handler(new Request('http://local/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Implement Thread' }),
    }))
    const createPayload = await createResponse.json() as { detail: { threadId: string } }
    const threadId = createPayload.detail.threadId

    await handler(new Request(`http://local/api/threads/${threadId}/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Ship the implementation.', mode: 'implement' }),
    }))

    await new Promise((resolve) => setTimeout(resolve, 260))

    const runtimeResponse = await handler(new Request(`http://local/api/threads/${threadId}/runtime`))
    const runtimePayload = await runtimeResponse.json() as {
      runtime: { events: string[]; lastAgentText: string }
    }
    expect(runtimePayload.runtime.events).toContain('src/agent-app.ts')
    expect(runtimePayload.runtime.lastAgentText).toContain('browser-facing agent terminal prototype')
  })

  it('rejects requests when the API key does not match', async () => {
    const backend = createMockThreadBackend()
    const handler = createAgentTerminalHandler({ backend, apiKey: 'secret-token' })

    const unauthorizedResponse = await handler(new Request('http://local/api/threads'))
    expect(unauthorizedResponse.status).toBe(401)

    const authorizedResponse = await handler(new Request('http://local/api/threads', {
      headers: { 'x-agent-terminal-key': 'secret-token' },
    }))
    expect(authorizedResponse.status).toBe(200)
  })

  it('writes debug log entries through the API', async () => {
    const backend = createMockThreadBackend()
    const entries: string[] = []
    const handler = createAgentTerminalHandler({
      backend,
      debugLogger(entry) {
        entries.push(entry)
      },
    })

    const response = await handler(new Request('http://local/api/debug-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: '17:30:00 glass:create:ok' }),
    }))

    expect(response.status).toBe(201)
    expect(entries).toEqual(['17:30:00 glass:create:ok'])
  })

  it('exposes backend status metadata', async () => {
    const backend = createMockThreadBackend()
    const handler = createAgentTerminalHandler({
      backend,
      backendInfo: {
        mode: 'codex',
        workspacePath: 'C:/repo/even-dev',
      },
    })

    const response = await handler(new Request('http://local/api/status'))
    const payload = await response.json() as { backend: string; workspacePath: string }

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      backend: 'codex',
      workspacePath: 'C:/repo/even-dev',
      sttAvailable: false,
    })
  })

  it('streams audio chunks through the STT session endpoints', async () => {
    const backend = createMockThreadBackend()
    const stt = {
      startSession: vi.fn(() => ({ sessionId: 'stt-1' })),
      appendChunk: vi.fn(async () => ({ chunkCount: 1, byteLength: 4 })),
      finishSession: vi.fn(async () => ({
        transcript: 'draft from audio',
        chunkCount: 1,
        byteLength: 4,
      })),
    }
    const handler = createAgentTerminalHandler({ backend, stt })

    const startResponse = await handler(new Request('http://local/api/stt/sessions', {
      method: 'POST',
    }))
    expect(startResponse.status).toBe(201)
    await expect(startResponse.json()).resolves.toEqual({ sessionId: 'stt-1' })

    const chunkResponse = await handler(new Request('http://local/api/stt/sessions/stt-1/chunks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audioPcm: [1, 2, 3, 4] }),
    }))
    expect(chunkResponse.status).toBe(202)
    await expect(chunkResponse.json()).resolves.toEqual({
      ok: true,
      chunkCount: 1,
      byteLength: 4,
    })

    const finishResponse = await handler(new Request('http://local/api/stt/sessions/stt-1/finish', {
      method: 'POST',
    }))
    expect(finishResponse.status).toBe(200)
    await expect(finishResponse.json()).resolves.toEqual({
      transcript: 'draft from audio',
      chunkCount: 1,
      byteLength: 4,
    })
  })

  it('accepts binary audio chunks for the STT session endpoint', async () => {
    const backend = createMockThreadBackend()
    const stt = {
      startSession: vi.fn(() => ({ sessionId: 'stt-2' })),
      appendChunk: vi.fn(async () => ({ chunkCount: 1, byteLength: 4 })),
      finishSession: vi.fn(async () => ({
        transcript: 'draft from binary audio',
        chunkCount: 1,
        byteLength: 4,
      })),
    }
    const handler = createAgentTerminalHandler({ backend, stt })

    await handler(new Request('http://local/api/stt/sessions', {
      method: 'POST',
    }))

    const chunkResponse = await handler(new Request('http://local/api/stt/sessions/stt-2/chunks', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
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
    const backend = createMockThreadBackend()
    const transcribeAudio = vi.fn(async ({ language }: { language?: string }) => language ?? '')
    const handler = createAgentTerminalHandler({
      backend,
      stt: createSttSessionService({ transcribeAudio }),
    })

    const startResponse = await handler(new Request('http://local/api/stt/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'ja' }),
    }))
    const { sessionId } = await startResponse.json() as { sessionId: string }

    await handler(new Request(`http://local/api/stt/sessions/${sessionId}/chunks`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3, 4]),
      duplex: 'half',
    }))

    const finishResponse = await handler(new Request(`http://local/api/stt/sessions/${sessionId}/finish`, {
      method: 'POST',
    }))

    expect(transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja' }))
    await expect(finishResponse.json()).resolves.toMatchObject({ transcript: 'ja' })
  })
})
