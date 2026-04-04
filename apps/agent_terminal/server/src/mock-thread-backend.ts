import { randomUUID } from 'node:crypto'
import {
  createEmptyRuntimeSnapshot,
  type ConversationEntry,
  type RuntimeSnapshot,
  type SessionDetail,
  type SessionSummary,
  type ThreadBackend,
  type ThreadEvent,
  type TurnMode,
} from './thread-backend.ts'

type MockThread = {
  id: string
  title: string
  preview: string
  updatedAt: number
  status: SessionSummary['status']
  messages: ConversationEntry[]
}

function createReplyText(prompt: string): string {
  return [
    'Discussion Response',
    `You said: ${prompt}`,
    '',
    'Direction',
    '- Keep session selection as the primary entry point on the glasses.',
    '- Show only the latest message plus the current local voice reply on the glasses.',
    '- Keep the full conversation history on the web companion.',
    '',
    'Implementation Outline',
    '1. List recent sessions.',
    '2. Resume the selected session.',
    '3. Capture voice into a local reply draft.',
    '4. Send the reply back into the active coding thread.',
  ].join('\n')
}

function createImplementText(prompt: string): string {
  return [
    'Created the first browser-facing agent terminal prototype.',
    `Prompt: ${prompt}`,
    'Focused on the session-first glasses workflow and reply loop.',
  ].join('\n')
}

export function createMockThreadBackend(): ThreadBackend {
  const threads: MockThread[] = []
  const listeners = new Set<(event: ThreadEvent) => void>()
  const runtimes = new Map<string, RuntimeSnapshot>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const emit = (event: ThreadEvent): void => {
    for (const listener of listeners) {
      listener(event)
    }
  }

  const getThread = (threadId: string): MockThread | undefined => threads.find((thread) => thread.id === threadId)

  const setRuntime = (threadId: string, updater: (current: RuntimeSnapshot) => RuntimeSnapshot): RuntimeSnapshot => {
    const next = updater(runtimes.get(threadId) ?? createEmptyRuntimeSnapshot(threadId))
    runtimes.set(threadId, next)
    return next
  }

  const toDetail = (thread: MockThread): SessionDetail => ({
    threadId: thread.id,
    title: thread.title,
    preview: thread.preview,
    updatedAt: thread.updatedAt,
    status: thread.status,
    messages: [...thread.messages],
  })

  const schedule = (callback: () => void, delayMs: number): void => {
    const handle = setTimeout(() => {
      timers.delete(handle)
      callback()
    }, delayMs)
    timers.add(handle)
  }

  return {
    async listThreads(limit = 20): Promise<SessionSummary[]> {
      return threads
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map((thread) => ({
          id: thread.id,
          title: thread.title,
          preview: thread.preview,
          updatedAt: thread.updatedAt,
          status: thread.status,
        }))
    },

    async createThread(title = `Agent Terminal Session ${threads.length + 1}`): Promise<SessionDetail> {
      const thread: MockThread = {
        id: randomUUID(),
        title,
        preview: '',
        updatedAt: Date.now(),
        status: 'idle',
        messages: [],
      }
      threads.unshift(thread)
      return toDetail(thread)
    },

    async readThread(threadId: string): Promise<SessionDetail | null> {
      const thread = getThread(threadId)
      return thread ? toDetail(thread) : null
    },

    async resumeThread(threadId: string): Promise<SessionDetail | null> {
      const thread = getThread(threadId)
      return thread ? toDetail(thread) : null
    },

    async startTurn(threadId: string, text: string, mode: TurnMode): Promise<{ threadId: string; turnId: string }> {
      const thread = getThread(threadId)
      if (!thread) {
        throw new Error(`Unknown thread: ${threadId}`)
      }

      const turnId = randomUUID()
      const userMessageId = randomUUID()
      const assistantMessageId = randomUUID()
      const assistantText = mode === 'implement' ? createImplementText(text) : createReplyText(text)
      const assistantChunks = mode === 'implement'
        ? ['Created the first browser-facing ', 'agent terminal prototype.']
        : ['Discussion Response\nYou said: ', `${text}\n\nDirection\n- Keep session selection as the primary entry point on the glasses.`]

      thread.status = 'active'
      thread.updatedAt = Date.now()
      thread.preview = text
      setRuntime(threadId, (current) => ({
        ...current,
        running: true,
        turnId,
        status: 'running',
        error: null,
      }))

      emit({
        threadId,
        type: 'thread-status',
        status: 'active',
      })
      emit({
        threadId,
        type: 'turn-started',
        turnId,
      })

      schedule(() => {
        thread.messages.push({
          id: userMessageId,
          role: 'user',
          text,
          turnId,
          isStreaming: false,
        })
        thread.updatedAt = Date.now()
        emit({
          threadId,
          type: 'message-completed',
          turnId,
          itemId: userMessageId,
          role: 'user',
          text,
        })
      }, 25)

      schedule(() => {
        emit({
          threadId,
          type: 'message-delta',
          turnId,
          itemId: assistantMessageId,
          role: 'assistant',
          delta: assistantChunks[0] ?? '',
          text: assistantChunks[0] ?? '',
        })
      }, 80)

      schedule(() => {
        emit({
          threadId,
          type: 'message-delta',
          turnId,
          itemId: assistantMessageId,
          role: 'assistant',
          delta: assistantChunks[1] ?? '',
          text: assistantChunks.join(''),
        })
      }, 120)

      if (mode === 'implement') {
        schedule(() => {
          emit({
            threadId,
            type: 'runtime-event',
            text: 'src/agent-app.ts',
          })
        }, 140)
      }

      schedule(() => {
        thread.messages.push({
          id: assistantMessageId,
          role: 'assistant',
          text: assistantText,
          turnId,
          isStreaming: false,
        })
        thread.preview = assistantText
        thread.updatedAt = Date.now()
        thread.status = 'idle'
        setRuntime(threadId, (current) => ({
          ...current,
          running: false,
          turnId: null,
          status: 'completed',
          lastAgentText: assistantText,
          events: mode === 'implement'
            ? ['src/agent-app.ts', 'Created the first browser-facing agent terminal prototype.']
            : current.events,
        }))
        emit({
          threadId,
          type: 'message-completed',
          turnId,
          itemId: assistantMessageId,
          role: 'assistant',
          text: assistantText,
        })
        emit({
          threadId,
          type: 'thread-status',
          status: 'idle',
        })
        emit({
          threadId,
          type: 'turn-completed',
          turnId,
          status: 'completed',
          error: null,
        })
      }, 220)

      return { threadId, turnId }
    },

    async interruptTurn(threadId: string): Promise<boolean> {
      const runtime = runtimes.get(threadId)
      if (!runtime?.turnId) {
        return false
      }
      runtimes.set(threadId, {
        ...runtime,
        running: false,
        turnId: null,
        status: 'interrupted',
      })
      emit({
        threadId,
        type: 'turn-completed',
        turnId: runtime.turnId,
        status: 'interrupted',
        error: null,
      })
      return true
    },

    getRuntime(threadId: string): RuntimeSnapshot {
      return runtimes.get(threadId) ?? createEmptyRuntimeSnapshot(threadId)
    },

    subscribe(listener: (event: ThreadEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async close(): Promise<void> {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    },
  }
}
