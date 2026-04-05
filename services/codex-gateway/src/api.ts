import type { ThreadBackend, TurnMode } from './thread-backend.ts'
import type { SttSessionService } from './stt-service.ts'
import {
  createVoiceEntryChatCompletion,
  extractLatestUserText,
  isAuthorizedVoiceEntryRequest,
  runVoiceEntryCommand,
} from './voice-entry.ts'

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-headers', 'content-type,x-agent-terminal-key')
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function notFound(): Response {
  return json({ error: 'Not Found' }, { status: 404 })
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (!raw) {
    return {}
  }
  return JSON.parse(raw) as Record<string, unknown>
}

async function readAudioChunk(request: Request): Promise<Uint8Array> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/octet-stream')) {
    return new Uint8Array(await request.arrayBuffer())
  }

  const body = await readJson(request)
  const audioPcm = Array.isArray(body.audioPcm) ? body.audioPcm : []
  return Uint8Array.from(audioPcm.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 255))
}

function getThreadId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:(?:api)\/)?threads\/([^/]+)/)
  return match?.[1] ?? null
}

function getSttSessionId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:(?:api)\/)?stt\/sessions\/([^/]+)/)
  return match?.[1] ?? null
}

function isThreadsRoot(pathname: string): boolean {
  return pathname === '/threads' || pathname === '/api/threads'
}

function isSttSessionsRoot(pathname: string): boolean {
  return pathname === '/stt/sessions' || pathname === '/api/stt/sessions'
}

function isThreadEventsPath(pathname: string): boolean {
  return /^\/(?:(?:api)\/)?threads\/[^/]+\/events$/.test(pathname)
}

export function matchesThreadEventsPath(pathname: string): boolean {
  return isThreadEventsPath(pathname)
}

export function isAuthorizedRequest(url: URL, headers: Headers, apiKey?: string): boolean {
  const expectedApiKey = apiKey?.trim()
  if (!expectedApiKey) {
    return true
  }

  const provided = headers.get('x-agent-terminal-key')?.trim()
    ?? url.searchParams.get('token')?.trim()
    ?? ''
  return provided === expectedApiKey
}

export function createCodexGatewayHandler(deps: {
  backend: ThreadBackend
  getActiveThreadId: () => string | null
  setActiveThreadId: (threadId: string | null) => void
  apiKey?: string
  voiceEntryToken?: string
  stt?: SttSessionService
  debugLogger?: (entry: string) => void
  workspacePath: string
}) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return json({ ok: true })
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      if (!isAuthorizedVoiceEntryRequest(request.headers, deps.voiceEntryToken)) {
        return json({ error: 'Unauthorized' }, { status: 401 })
      }
      const body = await readJson(request)
      const userText = extractLatestUserText(body)
      if (!userText) {
        return json({ error: 'Missing user message' }, { status: 400 })
      }
      const result = await runVoiceEntryCommand(deps.backend, deps.getActiveThreadId(), userText)
      deps.debugLogger?.(`voice-entry:${result.detail?.threadId ?? 'none'}:${result.turnStarted ? 'turn' : 'noop'}`)
      return json(createVoiceEntryChatCompletion(body, result))
    }

    if (!isAuthorizedRequest(url, request.headers, deps.apiKey)) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (request.method === 'GET' && isThreadsRoot(url.pathname)) {
      const limit = Number(url.searchParams.get('limit') ?? 20)
      return json({
        threads: await deps.backend.listThreads(Number.isFinite(limit) ? limit : 20),
      })
    }

    if (request.method === 'GET' && (url.pathname === '/status' || url.pathname === '/api/status')) {
      return json({
        backend: 'codex',
        workspacePath: deps.workspacePath,
        activeThreadId: deps.getActiveThreadId(),
        sttAvailable: Boolean(deps.stt),
      })
    }

    if (request.method === 'GET' && (url.pathname === '/active-thread' || url.pathname === '/api/active-thread')) {
      return json({
        threadId: deps.getActiveThreadId(),
      })
    }

    if (request.method === 'POST' && isSttSessionsRoot(url.pathname)) {
      if (!deps.stt) {
        return json({ error: 'STT unavailable' }, { status: 503 })
      }
      const body = await readJson(request)
      const language = typeof body.language === 'string' ? body.language.trim() : ''
      return json(deps.stt.startSession({ language }), { status: 201 })
    }

    if (request.method === 'POST' && isThreadsRoot(url.pathname)) {
      const body = await readJson(request)
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const detail = await deps.backend.createThread(title || undefined)
      deps.setActiveThreadId(detail.threadId)
      return json({ detail }, { status: 201 })
    }

    if (request.method === 'POST' && (url.pathname === '/debug-log' || url.pathname === '/api/debug-log')) {
      const body = await readJson(request)
      const entry = typeof body.entry === 'string' ? body.entry.trim() : ''
      if (!entry) {
        return json({ error: 'Missing debug entry' }, { status: 400 })
      }
      deps.debugLogger?.(entry)
      return json({ ok: true }, { status: 201 })
    }

    const threadId = getThreadId(url.pathname)
    const sttSessionId = getSttSessionId(url.pathname)
    if (sttSessionId) {
      if (!deps.stt) {
        return json({ error: 'STT unavailable' }, { status: 503 })
      }

      if (request.method === 'POST' && url.pathname.endsWith('/chunks')) {
        const chunk = await readAudioChunk(request)
        const stats = await deps.stt.appendChunk(sttSessionId, chunk)
        return json({ ok: true, ...stats }, { status: 202 })
      }

      if (request.method === 'POST' && url.pathname.endsWith('/finish')) {
        const result = await deps.stt.finishSession(sttSessionId)
        deps.debugLogger?.(`stt:finish:${sttSessionId}:${result.chunkCount}:${result.byteLength}`)
        return json(result)
      }

      return notFound()
    }

    if (!threadId) {
      return notFound()
    }

    if (request.method === 'POST' && url.pathname.endsWith('/resume')) {
      const detail = await deps.backend.resumeThread(threadId)
      if (detail) {
        deps.setActiveThreadId(detail.threadId)
      }
      return json({ detail })
    }

    if (request.method === 'GET' && url.pathname.match(/^\/(?:(?:api)\/)?threads\/[^/]+$/)) {
      const detail = await deps.backend.readThread(threadId)
      return json({ detail })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/activate')) {
      const detail = await deps.backend.readThread(threadId) ?? await deps.backend.resumeThread(threadId)
      if (!detail) {
        return json({ error: 'Thread not found' }, { status: 404 })
      }
      deps.setActiveThreadId(detail.threadId)
      return json({
        threadId: detail.threadId,
      })
    }

    if (request.method === 'GET' && url.pathname.endsWith('/runtime')) {
      return json({
        runtime: deps.backend.getRuntime(threadId),
      })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/turns')) {
      const body = await readJson(request)
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      const mode: TurnMode = body.mode === 'implement' ? 'implement' : 'reply'
      if (!text) {
        return json({ error: 'Missing turn text' }, { status: 400 })
      }
      return json({
        started: await deps.backend.startTurn(threadId, text, mode),
      }, { status: 202 })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/interrupt')) {
      return json({
        ok: await deps.backend.interruptTurn(threadId),
      })
    }

    return notFound()
  }
}
