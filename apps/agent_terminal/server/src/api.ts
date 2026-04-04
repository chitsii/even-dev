import type { ThreadBackend, TurnMode } from './thread-backend.ts'

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

function getThreadId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:(?:api|__agent_terminal_api)\/)?threads\/([^/]+)/)
  return match?.[1] ?? null
}

function isThreadsRoot(pathname: string): boolean {
  return pathname === '/threads' || pathname === '/api/threads' || pathname === '/__agent_terminal_api/threads'
}

function isThreadEventsPath(pathname: string): boolean {
  return /^\/(?:(?:api|__agent_terminal_api)\/)?threads\/[^/]+\/events$/.test(pathname)
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

export function createAgentTerminalHandler(deps: {
  backend: ThreadBackend
  apiKey?: string
  debugLogger?: (entry: string) => void
}) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return json({ ok: true })
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

    if (request.method === 'POST' && isThreadsRoot(url.pathname)) {
      const body = await readJson(request)
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      return json({
        detail: await deps.backend.createThread(title || undefined),
      }, { status: 201 })
    }

    if (request.method === 'POST' && (
      url.pathname === '/debug-log'
      || url.pathname === '/api/debug-log'
      || url.pathname === '/__agent_terminal_api/debug-log'
    )) {
      const body = await readJson(request)
      const entry = typeof body.entry === 'string' ? body.entry.trim() : ''
      if (!entry) {
        return json({ error: 'Missing debug entry' }, { status: 400 })
      }
      deps.debugLogger?.(entry)
      return json({ ok: true }, { status: 201 })
    }

    const threadId = getThreadId(url.pathname)
    if (!threadId) {
      return notFound()
    }

    if (request.method === 'POST' && url.pathname.endsWith('/resume')) {
      return json({
        detail: await deps.backend.resumeThread(threadId),
      })
    }

    if (request.method === 'GET' && url.pathname.match(/^\/(?:(?:api|__agent_terminal_api)\/)?threads\/[^/]+$/)) {
      return json({
        detail: await deps.backend.readThread(threadId),
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
