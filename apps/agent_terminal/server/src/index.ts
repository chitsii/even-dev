import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createAgentTerminalHandler, isAuthorizedRequest, matchesThreadEventsPath } from './api.ts'
import { createCodexThreadBackend } from './codex-thread-backend.ts'
import { createFileDebugLogger } from './debug-log.ts'
import { createMockThreadBackend } from './mock-thread-backend.ts'
import type { ThreadEvent } from './thread-backend.ts'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? process.env.AGENT_TERMINAL_SERVER_HOST ?? '127.0.0.1'
const dataDir = process.env.AGENT_TERMINAL_DATA_DIR ?? join(tmpdir(), 'even-dev', 'agent_terminal')
const debugLogger = createFileDebugLogger(join(dataDir, 'debug.log'))
const workspacePath = process.env.AGENT_TERMINAL_WORKSPACE_PATH ?? resolve(process.cwd(), '..', '..', '..')
const backend = process.env.AGENT_TERMINAL_USE_MOCK_AGENT === '1'
  ? createMockThreadBackend()
  : createCodexThreadBackend({
      workspacePath,
    })

const handler = createAgentTerminalHandler({
  backend,
  apiKey: process.env.AGENT_TERMINAL_API_KEY,
  debugLogger,
})

function writeSse(res: import('node:http').ServerResponse, event: ThreadEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`)

    if (req.method === 'GET' && matchesThreadEventsPath(url.pathname)) {
      if (!isAuthorizedRequest(url, new Headers(req.headers as HeadersInit), process.env.AGENT_TERMINAL_API_KEY)) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }

      const threadId = url.pathname.split('/').slice(-2, -1)[0]
      if (!threadId) {
        res.statusCode = 404
        res.end()
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      })

      writeSse(res, {
        threadId,
        type: 'runtime-event',
        text: 'connected',
      })

      const unsubscribe = backend.subscribe((event) => {
        if (event.threadId !== threadId) {
          return
        }
        writeSse(res, event)
      })

      const runtime = backend.getRuntime(threadId)
      if (runtime.turnId || runtime.lastAgentText || runtime.events.length > 0 || runtime.error) {
        writeSse(res, {
          threadId,
          type: 'runtime-event',
          text: JSON.stringify(runtime),
        })
      }

      req.on('close', () => {
        unsubscribe()
        res.end()
      })
      return
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: req.method && req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      duplex: 'half',
    })
    const response = await handler(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    if (response.body) {
      Readable.fromWeb(response.body as never).pipe(res)
      return
    }

    res.end()
  } catch (error) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    const message = error instanceof Error ? error.message : String(error)
    res.end(JSON.stringify({ error: message }))
  }
})

server.listen(port, host, () => {
  console.log(`[agent_terminal/server] Listening on http://${host}:${port}`)
  console.log(`[agent_terminal/server] Data directory: ${dataDir}`)
})

process.on('exit', () => {
  void backend.close?.()
})
