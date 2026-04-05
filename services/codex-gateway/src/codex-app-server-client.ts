import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

type JsonRpcId = number

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id: JsonRpcId
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type JsonRpcNotification = {
  jsonrpc?: '2.0'
  method: string
  params?: unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export type CodexAppServerClient = ReturnType<typeof createCodexAppServerClient>

export function createCodexAppServerClient() {
  let child: ChildProcessWithoutNullStreams | null = null
  let initialized = false
  let nextId = 1
  const pending = new Map<JsonRpcId, PendingRequest>()
  const listeners = new Set<(notification: JsonRpcNotification) => void>()

  const rejectPending = (message: string): void => {
    for (const request of pending.values()) {
      request.reject(new Error(message))
    }
    pending.clear()
  }

  const handleStdoutLine = (line: string): void => {
    if (!line.trim()) {
      return
    }

    let parsed: JsonRpcResponse | JsonRpcNotification
    try {
      parsed = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification
    } catch {
      return
    }

    if ('id' in parsed) {
      const request = pending.get(parsed.id)
      if (!request) {
        return
      }
      pending.delete(parsed.id)
      if (parsed.error) {
        request.reject(new Error(parsed.error.message))
        return
      }
      request.resolve(parsed.result)
      return
    }

    if ('method' in parsed) {
      for (const listener of listeners) {
        listener(parsed)
      }
    }
  }

  const start = async (): Promise<void> => {
    if (child) {
      return
    }

    const command = process.platform === 'win32' ? 'cmd.exe' : 'codex'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'codex', 'app-server', '--listen', 'stdio://']
      : ['app-server', '--listen', 'stdio://']

    child = spawn(command, args, {
      stdio: 'pipe',
      env: process.env,
      shell: false,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    createInterface({ input: child.stdout }).on('line', handleStdoutLine)
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (!line.trim()) {
        return
      }
      for (const listener of listeners) {
        listener({
          method: 'error',
          params: {
            threadId: null,
            message: line,
          },
        })
      }
    })

    child.once('exit', () => {
      child = null
      initialized = false
      rejectPending('codex app-server exited unexpectedly')
    })

    await initialize()
  }

  const send = async <T>(method: string, params?: unknown): Promise<T> => {
    await start()
    if (!child?.stdin) {
      throw new Error('codex app-server is not running')
    }

    const id = nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }

    const resultPromise = new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    })

    child.stdin.write(`${JSON.stringify(request)}\n`)
    return resultPromise
  }

  const notify = async (method: string, params?: unknown): Promise<void> => {
    await start()
    if (!child?.stdin) {
      throw new Error('codex app-server is not running')
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    }

    child.stdin.write(`${JSON.stringify(notification)}\n`)
  }

  const initialize = async (): Promise<void> => {
    if (initialized) {
      return
    }

    await send('initialize', {
      clientInfo: {
        name: 'codex-gateway',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    })
    await notify('initialized')
    initialized = true
  }

  return {
    async request<T>(method: string, params?: unknown): Promise<T> {
      return send<T>(method, params)
    },

    subscribe(listener: (notification: JsonRpcNotification) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async close(): Promise<void> {
      rejectPending('codex app-server closed')
      if (!child) {
        return
      }
      const currentChild = child
      child = null
      initialized = false
      currentChild.kill()
    },
  }
}
