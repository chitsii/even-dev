import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexAdapter } from './codex'
import type { AgentEvent } from './types'

class FakeStream extends EventEmitter {
  private chunks: string[] = []

  setEncoding(): void {}

  write(chunk: string): void {
    this.chunks.push(chunk)
  }

  end(): void {}

  getWrittenText(): string {
    return this.chunks.join('')
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new FakeStream()
  readonly stderr = new FakeStream()
  readonly stdin = new FakeStream()
  killed = false

  kill(): boolean {
    this.killed = true
    this.emit('exit', null, 'SIGTERM')
    return true
  }
}

describe('createCodexAdapter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps Codex JSONL to discuss events', async () => {
    const child = new FakeChildProcess()
    const adapter = createCodexAdapter({
      spawnProcess: () => child as never,
      execTimeoutMs: 1_000,
      idleTimeoutMs: 1_000,
    })
    const runtime = await adapter.createSession({
      kind: 'codex',
      workspacePath: 'C:/workspace/demo',
    })
    const events: AgentEvent[] = []
    runtime.subscribe((event) => {
      events.push(event)
    })

    const dispatchPromise = runtime.dispatch({
      type: 'send-prompt',
      prompt: {
        mode: 'discuss',
        text: 'Plan the next step.',
      },
    })

    child.stdout.emit('data', '{"type":"thread.started","thread_id":"thread-1"}\n')
    child.stdout.emit('data', '{"type":"turn.started"}\n')
    child.stdout.emit('data', '{"type":"item.completed","item":{"type":"agent_message","text":"Codex reply"}}\n')
    child.stdout.emit('data', '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n')
    child.emit('exit', 0, null)

    await dispatchPromise

    expect(child.stdin.getWrittenText()).toContain('Plan the next step.')
    expect(events).toEqual([
      { type: 'session-started', sessionId: 'thread-1' },
      { type: 'status', phase: 'thinking', message: 'Codex is running' },
      { type: 'message', mode: 'discuss', text: 'Codex reply' },
      { type: 'final', text: 'Codex reply' },
      { type: 'status', phase: 'done', message: 'Codex completed successfully' },
    ])
  })

  it('kills the process when no output arrives before the idle timeout', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess()
    const adapter = createCodexAdapter({
      spawnProcess: () => child as never,
      execTimeoutMs: 10_000,
      idleTimeoutMs: 100,
    })
    const runtime = await adapter.createSession({
      kind: 'codex',
      workspacePath: 'C:/workspace/demo',
    })
    const events: AgentEvent[] = []
    runtime.subscribe((event) => {
      events.push(event)
    })

    const dispatchPromise = runtime.dispatch({
      type: 'send-prompt',
      prompt: {
        mode: 'implement',
        text: 'Make the implementation.',
      },
    })

    await vi.advanceTimersByTimeAsync(150)
    await dispatchPromise

    expect(child.killed).toBe(true)
    expect(events).toContainEqual({
      type: 'error',
      message: 'Codex stopped after 100ms of inactivity',
    })
  })
})
