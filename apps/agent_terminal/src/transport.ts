export type SessionSummary = {
  id: string
  title: string
  preview: string
  updatedAt: number
  status: 'notLoaded' | 'idle' | 'active' | 'systemError'
}

export type ConversationEntry = {
  id: string
  role: 'user' | 'assistant'
  text: string
  turnId: string | null
  isStreaming: boolean
}

export type SessionDetail = {
  threadId: string
  title: string
  preview: string
  updatedAt: number
  status: SessionSummary['status']
  messages: ConversationEntry[]
}

export type RuntimeSnapshot = {
  threadId: string
  running: boolean
  turnId: string | null
  status: 'idle' | 'running' | 'completed' | 'error' | 'interrupted'
  lastAgentText: string
  events: string[]
  error: string | null
}

export type BackendStatus = {
  backend: 'mock' | 'codex'
  workspacePath: string
  activeThreadId?: string | null
  sttAvailable?: boolean
}

export type SttSessionStart = {
  sessionId: string
}

export type SttFinishResult = {
  transcript: string
  chunkCount: number
  byteLength: number
}

export class TransportRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'TransportRequestError'
    this.status = status
  }
}

export type ThreadEvent =
  | {
      threadId: string
      type: 'turn-started'
      turnId: string
    }
  | {
      threadId: string
      type: 'turn-completed'
      turnId: string
      status: RuntimeSnapshot['status']
      error: string | null
    }
  | {
      threadId: string
      type: 'message-delta'
      turnId: string
      itemId: string
      role: 'assistant'
      delta: string
      text: string
    }
  | {
      threadId: string
      type: 'message-completed'
      turnId: string | null
      itemId: string
      role: 'user' | 'assistant'
      text: string
    }
  | {
      threadId: string
      type: 'runtime-event'
      text: string
    }
  | {
      threadId: string
      type: 'thread-status'
      status: SessionSummary['status']
    }
  | {
      threadId: string | null
      type: 'error'
      message: string
    }

type TransportOptions = {
  getBasePath?: () => string
  getGatewayToken?: () => string
  requestTimeoutMs?: number
}

async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 2_000): Promise<T> {
  const controller = new AbortController()
  const timeoutHandle = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(path, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TransportRequestError('Request timed out')
      }
      throw new TransportRequestError(error instanceof Error ? error.message : 'Network request failed')
    }

    if (!response.ok) {
      throw new TransportRequestError(`Request failed: ${response.status}`, response.status)
    }

    return response.json() as Promise<T>
  } finally {
    window.clearTimeout(timeoutHandle)
  }
}

export function createAgentTerminalTransport(options: TransportOptions = {}) {
  const getBasePath = options.getBasePath ?? (() => '/__agent_terminal_api')
  const getGatewayToken = options.getGatewayToken ?? (() => '')
  const requestTimeoutMs = options.requestTimeoutMs ?? 2_000
  const withBasePath = (path: string): string => `${getBasePath()}${path}`
  const withHeaders = (headers?: HeadersInit): HeadersInit => {
    const gatewayToken = getGatewayToken().trim()
    return {
      ...(headers ?? {}),
      ...(gatewayToken ? { 'x-agent-terminal-key': gatewayToken } : {}),
    }
  }

  return {
    async listThreads(): Promise<SessionSummary[]> {
      const payload = await requestJson<{ threads: SessionSummary[] }>(withBasePath('/threads'), {
        headers: withHeaders(),
      }, requestTimeoutMs)
      return payload.threads
    },

    async createThread(title: string): Promise<SessionDetail | null> {
      try {
        const payload = await requestJson<{ detail: SessionDetail }>(withBasePath('/threads'), {
          method: 'POST',
          body: JSON.stringify({ title }),
          headers: withHeaders(),
        }, requestTimeoutMs)
        return payload.detail
      } catch {
        return null
      }
    },

    async readThread(threadId: string): Promise<SessionDetail | null> {
      try {
        const payload = await requestJson<{ detail: SessionDetail | null }>(withBasePath(`/threads/${threadId}`), {
          headers: withHeaders(),
        }, requestTimeoutMs)
        return payload.detail
      } catch {
        return null
      }
    },

    async resumeThread(threadId: string): Promise<SessionDetail | null> {
      try {
        const payload = await requestJson<{ detail: SessionDetail | null }>(withBasePath(`/threads/${threadId}/resume`), {
          method: 'POST',
          headers: withHeaders(),
        }, requestTimeoutMs)
        return payload.detail
      } catch {
        return null
      }
    },

    async activateThread(threadId: string): Promise<{ threadId: string }> {
      return requestJson<{ threadId: string }>(withBasePath(`/threads/${threadId}/activate`), {
        method: 'POST',
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async startTurn(threadId: string, text: string, mode: 'reply' | 'implement') {
      return requestJson<{ started: { threadId: string; turnId: string } }>(withBasePath(`/threads/${threadId}/turns`), {
        method: 'POST',
        body: JSON.stringify({ text, mode }),
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async interruptTurn(threadId: string) {
      return requestJson<{ ok: boolean }>(withBasePath(`/threads/${threadId}/interrupt`), {
        method: 'POST',
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async getRuntime(threadId: string): Promise<RuntimeSnapshot> {
      const payload = await requestJson<{ runtime: RuntimeSnapshot }>(withBasePath(`/threads/${threadId}/runtime`), {
        headers: withHeaders(),
      }, requestTimeoutMs)
      return payload.runtime
    },

    async getBackendStatus(): Promise<BackendStatus> {
      return requestJson<BackendStatus>(withBasePath('/status'), {
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async startSttSession(language?: string): Promise<SttSessionStart> {
      return requestJson<SttSessionStart>(withBasePath('/stt/sessions'), {
        method: 'POST',
        body: JSON.stringify(language ? { language } : {}),
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async appendSttChunk(sessionId: string, audioPcm: Uint8Array): Promise<{ ok: boolean; chunkCount: number; byteLength: number }> {
      return requestJson<{ ok: boolean; chunkCount: number; byteLength: number }>(withBasePath(`/stt/sessions/${sessionId}/chunks`), {
        method: 'POST',
        body: JSON.stringify({ audioPcm: Array.from(audioPcm) }),
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async finishSttSession(sessionId: string): Promise<SttFinishResult> {
      return requestJson<SttFinishResult>(withBasePath(`/stt/sessions/${sessionId}/finish`), {
        method: 'POST',
        headers: withHeaders(),
      }, requestTimeoutMs)
    },

    async probeGateway(baseUrl: string, gatewayToken: string): Promise<BackendStatus> {
      const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
      return requestJson<BackendStatus>(`${normalizedBaseUrl}/status`, {
        headers: gatewayToken.trim() ? { 'x-agent-terminal-key': gatewayToken.trim() } : undefined,
      }, requestTimeoutMs)
    },

    subscribeToThreadEvents(threadId: string, onEvent: (event: ThreadEvent) => void): () => void {
      const token = getGatewayToken().trim()
      const url = new URL(withBasePath(`/threads/${threadId}/events`), window.location.origin)
      if (token) {
        url.searchParams.set('token', token)
      }

      const eventSource = new EventSource(url.toString())
      eventSource.onopen = () => {
        onEvent({
          threadId,
          type: 'runtime-event',
          text: 'event-stream-open',
        })
      }
      eventSource.onmessage = (message) => {
        try {
          onEvent(JSON.parse(message.data) as ThreadEvent)
        } catch {
          // Ignore malformed SSE frames.
        }
      }
      eventSource.onerror = () => {
        onEvent({
          threadId,
          type: 'runtime-event',
          text: 'event-stream-error',
        })
      }

      return () => {
        eventSource.close()
      }
    },

    async appendDebugLog(entry: string) {
      return requestJson<{ ok: true }>(withBasePath('/debug-log'), {
        method: 'POST',
        body: JSON.stringify({ entry }),
        headers: withHeaders(),
      }, requestTimeoutMs)
    },
  }
}
