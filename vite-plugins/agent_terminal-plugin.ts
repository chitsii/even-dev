import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function proxyRequest(req: IncomingMessage, res: ServerResponse, port: string): void {
  const targetUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  const upstream = new Request(targetUrl, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method && req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    duplex: 'half',
  })

  void fetch(upstream)
    .then(async (response) => {
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      const body = Buffer.from(await response.arrayBuffer())
      res.end(body)
    })
    .catch((error) => {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json; charset=utf-8')
      const message = error instanceof Error ? error.message : String(error)
      res.end(JSON.stringify({ error: message }))
    })
}

export default function agentTerminalProxy(): Plugin {
  const port = process.env.AGENT_TERMINAL_SERVER_PORT ?? '8787'
  return {
    name: 'agent-terminal-proxy',
    configureServer(server) {
      server.middlewares.use('/__agent_terminal_api', (req, res) => {
        proxyRequest(req, res, port)
      })
    },
  }
}
