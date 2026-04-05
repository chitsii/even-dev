import { createCodexAppServerClient, type CodexAppServerClient } from './codex-app-server-client.ts'
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

type CodexThreadStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'systemError' }
  | { type: 'active'; activeFlags: string[] }

type CodexThreadItem =
  | {
      type: 'userMessage'
      id: string
      content: Array<{ type: 'text'; text: string }>
    }
  | {
      type: 'agentMessage'
      id: string
      text: string
    }
  | {
      type: 'commandExecution'
      id: string
      command: string
      aggregatedOutput: string | null
    }
  | {
      type: 'fileChange'
      id: string
      changes: Array<{ path?: string }>
    }
  | {
      type: string
      id: string
      text?: string
    }

type CodexTurn = {
  id: string
  items: CodexThreadItem[]
  status: string
  error: { message?: string } | null
}

type CodexThread = {
  id: string
  preview: string
  updatedAt: number
  status: CodexThreadStatus
  name: string | null
  turns: CodexTurn[]
}

function normalizeStatus(status: CodexThreadStatus): SessionSummary['status'] {
  return status.type
}

function deriveTitle(thread: { id: string; name: string | null; preview: string }): string {
  if (thread.name?.trim()) {
    return thread.name.trim()
  }
  if (thread.preview.trim()) {
    const firstLine = thread.preview.trim().split(/\r?\n/, 1)[0] ?? ''
    return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine
  }
  return `Thread ${thread.id.slice(0, 8)}`
}

function extractUserMessageText(content: Array<{ type: 'text'; text: string }>): string {
  return content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim()
}

function normalizeMessages(thread: CodexThread): ConversationEntry[] {
  const messages: ConversationEntry[] = []
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type === 'userMessage') {
        messages.push({
          id: item.id,
          role: 'user',
          text: extractUserMessageText(item.content),
          turnId: turn.id,
          isStreaming: false,
        })
        continue
      }
      if (item.type === 'agentMessage') {
        messages.push({
          id: item.id,
          role: 'assistant',
          text: item.text,
          turnId: turn.id,
          isStreaming: false,
        })
      }
    }
  }
  return messages
}

function normalizeThreadDetail(thread: CodexThread): SessionDetail {
  return {
    threadId: thread.id,
    title: deriveTitle(thread),
    preview: thread.preview,
    updatedAt: thread.updatedAt * 1000,
    status: normalizeStatus(thread.status),
    messages: normalizeMessages(thread),
  }
}

function getLatestAssistantText(thread: CodexThread): string {
  for (let turnIndex = thread.turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = thread.turns[turnIndex]
    for (let itemIndex = turn.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = turn.items[itemIndex]
      if (item.type === 'agentMessage') {
        return item.text
      }
    }
  }
  return ''
}

function hydrateRuntimeSnapshot(thread: CodexThread, current: RuntimeSnapshot): RuntimeSnapshot {
  const latestTurn = thread.turns[thread.turns.length - 1] ?? null
  const latestAssistantText = getLatestAssistantText(thread)

  if (thread.status.type === 'active') {
    return {
      ...current,
      threadId: thread.id,
      running: true,
      turnId: latestTurn?.id ?? current.turnId,
      status: 'running',
      lastAgentText: latestAssistantText || current.lastAgentText,
      error: latestTurn?.error?.message ?? null,
    }
  }

  if (thread.status.type === 'systemError') {
    return {
      ...current,
      threadId: thread.id,
      running: false,
      turnId: null,
      status: 'error',
      lastAgentText: latestAssistantText || current.lastAgentText,
      error: latestTurn?.error?.message ?? current.error,
    }
  }

  return {
    ...current,
    threadId: thread.id,
    running: false,
    turnId: null,
    status: current.status === 'interrupted' ? 'interrupted' : 'idle',
    lastAgentText: latestAssistantText || current.lastAgentText,
    error: null,
  }
}

export function createCodexThreadBackend(options: {
  workspacePath: string
  client?: CodexAppServerClient
}): ThreadBackend {
  const client = options.client ?? createCodexAppServerClient()
  const listeners = new Set<(event: ThreadEvent) => void>()
  const runtimeSnapshots = new Map<string, RuntimeSnapshot>()
  const streamingMessages = new Map<string, { threadId: string; turnId: string; text: string }>()

  const emit = (event: ThreadEvent): void => {
    for (const listener of listeners) {
      listener(event)
    }
  }

  const getRuntime = (threadId: string): RuntimeSnapshot => {
    return runtimeSnapshots.get(threadId) ?? createEmptyRuntimeSnapshot(threadId)
  }

  const setRuntime = (threadId: string, updater: (current: RuntimeSnapshot) => RuntimeSnapshot): RuntimeSnapshot => {
    const next = updater(getRuntime(threadId))
    runtimeSnapshots.set(threadId, next)
    return next
  }

  const appendRuntimeEvent = (threadId: string, text: string): void => {
    setRuntime(threadId, (current) => ({
      ...current,
      events: [...current.events, text].slice(-20),
    }))
    emit({
      threadId,
      type: 'runtime-event',
      text,
    })
  }

  client.subscribe((notification) => {
    if (notification.method === 'error') {
      const params = notification.params as { threadId?: string | null; message?: string } | undefined
      emit({
        threadId: params?.threadId ?? null,
        type: 'error',
        message: params?.message ?? 'codex app-server error',
      })
      return
    }

    if (notification.method === 'thread/status/changed') {
      const params = notification.params as { threadId: string; status: CodexThreadStatus }
      const nextStatus = normalizeStatus(params.status)
      setRuntime(params.threadId, (current) => ({
        ...current,
        running: nextStatus === 'active' ? current.running : false,
        status: nextStatus === 'active' ? 'running' : current.status === 'error' ? 'error' : 'idle',
      }))
      emit({
        threadId: params.threadId,
        type: 'thread-status',
        status: nextStatus,
      })
      return
    }

    if (notification.method === 'turn/started') {
      const params = notification.params as { threadId: string; turn: { id: string } }
      setRuntime(params.threadId, (current) => ({
        ...current,
        running: true,
        turnId: params.turn.id,
        status: 'running',
        error: null,
      }))
      emit({
        threadId: params.threadId,
        type: 'turn-started',
        turnId: params.turn.id,
      })
      return
    }

    if (notification.method === 'item/agentMessage/delta') {
      const params = notification.params as { threadId: string; turnId: string; itemId: string; delta: string }
      const current = streamingMessages.get(params.itemId) ?? {
        threadId: params.threadId,
        turnId: params.turnId,
        text: '',
      }
      current.text += params.delta
      streamingMessages.set(params.itemId, current)
      setRuntime(params.threadId, (runtime) => ({
        ...runtime,
        lastAgentText: current.text,
      }))
      emit({
        threadId: params.threadId,
        type: 'message-delta',
        turnId: params.turnId,
        itemId: params.itemId,
        role: 'assistant',
        delta: params.delta,
        text: current.text,
      })
      return
    }

    if (notification.method === 'item/completed') {
      const params = notification.params as { threadId: string; turnId: string; item: CodexThreadItem }
      if (params.item.type === 'userMessage') {
        emit({
          threadId: params.threadId,
          type: 'message-completed',
          turnId: params.turnId,
          itemId: params.item.id,
          role: 'user',
          text: extractUserMessageText(params.item.content),
        })
        return
      }

      if (params.item.type === 'agentMessage') {
        streamingMessages.delete(params.item.id)
        setRuntime(params.threadId, (runtime) => ({
          ...runtime,
          lastAgentText: params.item.text,
        }))
        emit({
          threadId: params.threadId,
          type: 'message-completed',
          turnId: params.turnId,
          itemId: params.item.id,
          role: 'assistant',
          text: params.item.text,
        })
        return
      }

      if (params.item.type === 'commandExecution') {
        appendRuntimeEvent(params.threadId, params.item.command)
        return
      }

      if (params.item.type === 'fileChange') {
        const changedPath = params.item.changes[0]?.path ?? 'files changed'
        appendRuntimeEvent(params.threadId, changedPath)
      }
      return
    }

    if (notification.method === 'turn/completed') {
      const params = notification.params as { threadId: string; turn: { id: string; status: string; error: { message?: string } | null } }
      const nextStatus = params.turn.status === 'failed'
        ? 'error'
        : params.turn.status === 'interrupted'
          ? 'interrupted'
          : 'completed'
      setRuntime(params.threadId, (runtime) => ({
        ...runtime,
        running: false,
        turnId: null,
        status: nextStatus,
        error: params.turn.error?.message ?? null,
      }))
      emit({
        threadId: params.threadId,
        type: 'turn-completed',
        turnId: params.turn.id,
        status: nextStatus,
        error: params.turn.error?.message ?? null,
      })
    }
  })

  return {
    async listThreads(limit = 20): Promise<SessionSummary[]> {
      const result = await client.request<{ data: CodexThread[] }>('thread/list', {
        limit,
        archived: false,
      })
      return result.data.map((thread) => ({
        id: thread.id,
        title: deriveTitle(thread),
        preview: thread.preview,
        updatedAt: thread.updatedAt * 1000,
        status: normalizeStatus(thread.status),
      }))
    },

    async createThread(title?: string): Promise<SessionDetail> {
      const result = await client.request<{ thread: CodexThread }>('thread/start', {
        cwd: options.workspacePath,
        ephemeral: false,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      })
      if (title?.trim()) {
        await client.request('thread/name/set', {
          threadId: result.thread.id,
          name: title.trim(),
        })
        result.thread.name = title.trim()
      }
      return normalizeThreadDetail(result.thread)
    },

    async readThread(threadId: string): Promise<SessionDetail | null> {
      try {
        const result = await client.request<{ thread: CodexThread }>('thread/read', {
          threadId,
          includeTurns: true,
        })
        runtimeSnapshots.set(threadId, hydrateRuntimeSnapshot(result.thread, getRuntime(threadId)))
        return normalizeThreadDetail(result.thread)
      } catch {
        return null
      }
    },

    async resumeThread(threadId: string): Promise<SessionDetail | null> {
      try {
        const result = await client.request<{ thread: CodexThread }>('thread/resume', {
          threadId,
          persistExtendedHistory: true,
        })
        runtimeSnapshots.set(threadId, hydrateRuntimeSnapshot(result.thread, getRuntime(threadId)))
        return normalizeThreadDetail(result.thread)
      } catch {
        return null
      }
    },

    async startTurn(threadId: string, text: string, _mode: TurnMode): Promise<{ threadId: string; turnId: string }> {
      const result = await client.request<{ turn: { id: string } }>('turn/start', {
        threadId,
        input: [
          {
            type: 'text',
            text,
            text_elements: [],
          },
        ],
      })
      setRuntime(threadId, (runtime) => ({
        ...runtime,
        running: true,
        turnId: result.turn.id,
        status: 'running',
        error: null,
      }))
      return {
        threadId,
        turnId: result.turn.id,
      }
    },

    async interruptTurn(threadId: string): Promise<boolean> {
      const runtime = getRuntime(threadId)
      if (!runtime.turnId) {
        return false
      }
      await client.request('turn/interrupt', {
        threadId,
        turnId: runtime.turnId,
      })
      setRuntime(threadId, (current) => ({
        ...current,
        running: false,
        turnId: null,
        status: 'interrupted',
      }))
      return true
    },

    getRuntime(threadId: string): RuntimeSnapshot {
      return getRuntime(threadId)
    },

    subscribe(listener: (event: ThreadEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async close(): Promise<void> {
      await client.close()
    },
  }
}
