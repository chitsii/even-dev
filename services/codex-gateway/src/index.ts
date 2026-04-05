import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenAiSttTranscriber, createSttSessionService } from './stt-service.ts'
import { createCodexGatewayHandler, isAuthorizedRequest, matchesThreadEventsPath } from './api.ts'
import { createActiveThreadStore } from './active-thread-store.ts'
import { createCodexThreadBackend } from './codex-thread-backend.ts'
import { createFileDebugLogger } from './debug-log.ts'
import { loadDotEnvFile } from './env.ts'
import type { ThreadEvent } from './thread-backend.ts'

const serviceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
loadDotEnvFile(join(serviceRoot, '.env'))
loadDotEnvFile(join(serviceRoot, '.env.local'))

const port = Number(process.env.PORT ?? 8788)
const host = process.env.HOST ?? '127.0.0.1'
const dataDir = process.env.CODEX_GATEWAY_DATA_DIR ?? join(tmpdir(), 'codex-gateway')
const workspacePath = process.env.CODEX_GATEWAY_WORKSPACE_PATH ?? resolve(process.cwd(), '..', '..')
const apiKey = process.env.CODEX_GATEWAY_API_KEY
const voiceEntryToken = process.env.CODEX_GATEWAY_VOICE_ENTRY_TOKEN ?? apiKey
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || ''
const openAiSttModel = process.env.OPENAI_STT_MODEL?.trim() || 'gpt-4o-mini-transcribe'
const debugLogger = createFileDebugLogger(join(dataDir, 'debug.log'))
const backend = createCodexThreadBackend({ workspacePath })
const activeThreadStore = createActiveThreadStore(join(dataDir, 'active-thread.json'))
const stt = openAiApiKey
  ? createSttSessionService({
      transcribeAudio: createOpenAiSttTranscriber({
        apiKey: openAiApiKey,
        model: openAiSttModel,
      }),
    })
  : undefined

const handler = createCodexGatewayHandler({
  backend,
  stt,
  getActiveThreadId: () => activeThreadStore.getThreadId(),
  setActiveThreadId: (threadId) => activeThreadStore.setThreadId(threadId),
  apiKey,
  voiceEntryToken,
  debugLogger,
  workspacePath,
})

function writeSse(res: import('node:http').ServerResponse, event: ThreadEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`)

    if (req.method === 'GET' && matchesThreadEventsPath(url.pathname)) {
      if (!isAuthorizedRequest(url, new Headers(req.headers as HeadersInit), apiKey)) {
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
  console.log(`[codex-gateway] Listening on http://${host}:${port}`)
  console.log(`[codex-gateway] Workspace: ${workspacePath}`)
  console.log(`[codex-gateway] Data directory: ${dataDir}`)
  console.log(`[codex-gateway] OpenAI STT: ${stt ? openAiSttModel : 'disabled'}`)
  if (voiceEntryToken) {
    console.log(`[codex-gateway] Voice Entry endpoint: http://${host}:${port}/v1/chat/completions`)
  }
})

process.on('exit', () => {
  void backend.close?.()
})
