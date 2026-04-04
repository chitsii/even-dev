import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import type {
  AgentAction,
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentPrompt,
  AgentRuntime,
  AgentSessionConfig,
} from './types'

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams

type CodexAdapterOptions = {
  spawnProcess?: SpawnProcess
  execTimeoutMs?: number
  idleTimeoutMs?: number
  defaultModel?: string
}

const codexCapabilities: AgentCapabilities = {
  supportsApproval: false,
  supportsInterrupt: true,
  supportsStructuredFileChanges: false,
}

class CodexRuntime implements AgentRuntime {
  sessionId: string
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private readonly config: AgentSessionConfig
  private readonly spawnProcess: SpawnProcess
  private readonly execTimeoutMs: number
  private readonly idleTimeoutMs: number
  private readonly defaultModel?: string
  private currentChild: ChildProcessWithoutNullStreams | null = null

  constructor(config: AgentSessionConfig, options: CodexAdapterOptions) {
    this.config = config
    this.sessionId = `codex-${randomUUID()}`
    this.spawnProcess = options.spawnProcess ?? spawn
    this.execTimeoutMs = options.execTimeoutMs ?? 120_000
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000
    this.defaultModel = options.defaultModel
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async dispatch(action: AgentAction): Promise<void> {
    if (action.type === 'interrupt') {
      this.stopCurrentProcess('Interrupted by user')
      return
    }

    if (action.type !== 'send-prompt') {
      return
    }

    if (this.currentChild) {
      this.stopCurrentProcess('Interrupted by a newer Codex request')
    }

    return this.runPrompt(action.prompt)
  }

  async close(): Promise<void> {
    this.stopCurrentProcess('Runtime closed')
    this.listeners.clear()
  }

  private async runPrompt(prompt: AgentPrompt): Promise<void> {
    const { command, args } = this.buildCommand(prompt)
    const child = this.spawnProcess(command, args, {
      cwd: this.config.workspacePath,
      stdio: 'pipe',
      env: {
        ...process.env,
        ...(this.config.env ?? {}),
      },
    })

    this.currentChild = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdin.write(prompt.text)
    child.stdin.end()

    let finished = false
    let lastAgentMessage = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let execTimer: NodeJS.Timeout | null = null
    let idleTimer: NodeJS.Timeout | null = null

    const clearTimers = (): void => {
      if (execTimer) {
        clearTimeout(execTimer)
        execTimer = null
      }
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    const resetIdleTimer = (): void => {
      if (idleTimer) {
        clearTimeout(idleTimer)
      }
      idleTimer = setTimeout(() => {
        if (finished) {
          return
        }
        this.emit({
          type: 'error',
          message: `Codex stopped after ${this.idleTimeoutMs}ms of inactivity`,
        })
        this.stopCurrentProcess('Stopped by inactivity watchdog')
      }, this.idleTimeoutMs)
    }

    execTimer = setTimeout(() => {
      if (finished) {
        return
      }
      this.emit({
        type: 'error',
        message: `Codex exceeded the ${this.execTimeoutMs}ms execution timeout`,
      })
      this.stopCurrentProcess('Stopped by execution timeout')
    }, this.execTimeoutMs)

    resetIdleTimer()

    const handleJsonLine = (line: string): void => {
      if (!line.trim()) {
        return
      }

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }

      if (parsed.type === 'thread.started' && typeof parsed.thread_id === 'string') {
        this.sessionId = parsed.thread_id
        this.emit({ type: 'session-started', sessionId: this.sessionId })
        return
      }

      if (parsed.type === 'turn.started') {
        this.emit({ type: 'status', phase: 'thinking', message: 'Codex is running' })
        return
      }

      if (parsed.type === 'item.completed') {
        const item = parsed.item as { type?: unknown; text?: unknown } | undefined
        if (item?.type === 'agent_message' && typeof item.text === 'string') {
          lastAgentMessage = item.text
          if (prompt.mode === 'discuss') {
            this.emit({ type: 'message', mode: 'discuss', text: item.text })
          } else {
            this.emit({ type: 'summary', text: item.text })
          }
        }
        return
      }

      if (parsed.type === 'turn.completed') {
        if (lastAgentMessage) {
          this.emit({ type: 'final', text: lastAgentMessage })
        }
        this.emit({ type: 'status', phase: 'done', message: 'Codex completed successfully' })
      }
    }

    child.stdout.on('data', (chunk: string) => {
      resetIdleTimer()
      stdoutBuffer += chunk
      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex)
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        handleJsonLine(line)
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    })

    child.stderr.on('data', (chunk: string) => {
      resetIdleTimer()
      stderrBuffer += chunk
    })

    await new Promise<void>((resolve) => {
      child.once('error', (error) => {
        finished = true
        clearTimers()
        this.currentChild = null
        this.emit({ type: 'error', message: `Failed to start Codex: ${error.message}` })
        resolve()
      })

      child.once('exit', (code, signal) => {
        finished = true
        clearTimers()
        this.currentChild = null

        if (code !== 0 && signal !== 'SIGTERM') {
          const stderrText = stderrBuffer.trim()
          this.emit({
            type: 'error',
            message: stderrText || `Codex exited with code ${code ?? 'unknown'}`,
          })
        }

        resolve()
      })
    })
  }

  private buildCommand(prompt: AgentPrompt): { command: string; args: string[] } {
    const codexArgs = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--cd',
      this.config.workspacePath,
      '--sandbox',
      prompt.mode === 'implement' ? 'workspace-write' : 'read-only',
      '--ephemeral',
    ]

    if (this.defaultModel) {
      codexArgs.push('--model', this.defaultModel)
    }

    if (process.platform === 'win32') {
      return {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'codex', ...codexArgs],
      }
    }

    return {
      command: 'codex',
      args: codexArgs,
    }
  }

  private stopCurrentProcess(_reason: string): void {
    if (!this.currentChild) {
      return
    }

    const child = this.currentChild
    this.currentChild = null
    try {
      child.kill()
    } catch {
      // Ignore kill failures and let the watchdog/reporting path continue.
    }
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

export function createCodexAdapter(options: CodexAdapterOptions = {}): AgentAdapter {
  return {
    kind: 'codex',
    capabilities: codexCapabilities,
    async createSession(config: AgentSessionConfig): Promise<AgentRuntime> {
      return new CodexRuntime(config, options)
    },
  }
}
