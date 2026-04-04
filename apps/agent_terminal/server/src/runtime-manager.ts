import type { AgentAdapter, AgentEvent, AgentPrompt, AgentRuntime } from './agent-adapters/types.ts'

export type RuntimeSnapshot = {
  taskId: string
  running: boolean
  phase: 'idle' | 'thinking' | 'editing' | 'testing' | 'waiting-approval' | 'done' | 'error'
  lastText: string
  events: AgentEvent[]
  startedAt: number | null
  finishedAt: number | null
  error: string | null
}

export type RuntimeManager = ReturnType<typeof createRuntimeManager>

function createEmptySnapshot(taskId: string): RuntimeSnapshot {
  return {
    taskId,
    running: false,
    phase: 'idle',
    lastText: '',
    events: [],
    startedAt: null,
    finishedAt: null,
    error: null,
  }
}

export function createRuntimeManager(deps: {
  adapter: AgentAdapter
  workspacePath: string
  onSettled?: (result: {
    taskId: string
    prompt: AgentPrompt
    snapshot: RuntimeSnapshot
  }) => void | Promise<void>
}) {
  const activeRuntimes = new Map<string, AgentRuntime>()
  const snapshots = new Map<string, RuntimeSnapshot>()

  const updateSnapshot = (taskId: string, updater: (current: RuntimeSnapshot) => RuntimeSnapshot): RuntimeSnapshot => {
    const next = updater(snapshots.get(taskId) ?? createEmptySnapshot(taskId))
    snapshots.set(taskId, next)
    return next
  }

  return {
    getSnapshot(taskId: string): RuntimeSnapshot {
      return snapshots.get(taskId) ?? createEmptySnapshot(taskId)
    },

    async start(taskId: string, prompt: AgentPrompt): Promise<{ accepted: true }> {
      const existing = activeRuntimes.get(taskId)
      if (existing) {
        await existing.dispatch({ type: 'interrupt' })
        await existing.close()
        activeRuntimes.delete(taskId)
      }

      const runtime = await deps.adapter.createSession({
        kind: deps.adapter.kind,
        workspacePath: deps.workspacePath,
      })
      activeRuntimes.set(taskId, runtime)

      updateSnapshot(taskId, () => ({
        taskId,
        running: true,
        phase: 'thinking',
        lastText: '',
        events: [],
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
      }))

      runtime.subscribe((event) => {
        updateSnapshot(taskId, (current) => {
          const nextEvents = [...current.events, event].slice(-40)
          let nextPhase = current.phase
          let nextLastText = current.lastText
          let nextError = current.error
          let running = current.running
          let finishedAt = current.finishedAt

          if (event.type === 'status') {
            nextPhase = event.phase
            if (event.phase === 'done' || event.phase === 'error') {
              running = false
              finishedAt = Date.now()
            }
          }

          if (event.type === 'message' || event.type === 'summary' || event.type === 'final') {
            nextLastText = event.text
          }

          if (event.type === 'error') {
            nextPhase = 'error'
            nextError = event.message
            running = false
            finishedAt = Date.now()
          }

          return {
            ...current,
            running,
            phase: nextPhase,
            lastText: nextLastText,
            events: nextEvents,
            finishedAt,
            error: nextError,
          }
        })
      })

      void runtime.dispatch({
        type: 'send-prompt',
        prompt,
      }).finally(async () => {
        activeRuntimes.delete(taskId)
        await runtime.close()
        const snapshot = updateSnapshot(taskId, (current) => ({
          ...current,
          running: false,
          finishedAt: current.finishedAt ?? Date.now(),
        }))
        if (deps.onSettled) {
          await deps.onSettled({
            taskId,
            prompt,
            snapshot,
          })
        }
      })

      return { accepted: true }
    },

    async stop(taskId: string): Promise<void> {
      const runtime = activeRuntimes.get(taskId)
      if (!runtime) {
        return
      }
      await runtime.dispatch({ type: 'interrupt' })
      await runtime.close()
      activeRuntimes.delete(taskId)
      updateSnapshot(taskId, (current) => ({
        ...current,
        running: false,
        phase: 'idle',
        finishedAt: Date.now(),
      }))
    },
  }
}
