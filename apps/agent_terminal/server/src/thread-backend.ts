export type SessionSummary = {
  id: string
  title: string
  preview: string
  updatedAt: number
  status: 'notLoaded' | 'idle' | 'active' | 'systemError'
}

export type ConversationEntry = {
  id: string
  role: 'user' | 'assistant'
  text: string
  turnId: string | null
  isStreaming: boolean
}

export type SessionDetail = {
  threadId: string
  title: string
  preview: string
  updatedAt: number
  status: SessionSummary['status']
  messages: ConversationEntry[]
}

export type RuntimeSnapshot = {
  threadId: string
  running: boolean
  turnId: string | null
  status: 'idle' | 'running' | 'completed' | 'error' | 'interrupted'
  lastAgentText: string
  events: string[]
  error: string | null
}

export type ThreadEvent =
  | {
      threadId: string
      type: 'turn-started'
      turnId: string
    }
  | {
      threadId: string
      type: 'turn-completed'
      turnId: string
      status: RuntimeSnapshot['status']
      error: string | null
    }
  | {
      threadId: string
      type: 'message-delta'
      turnId: string
      itemId: string
      role: 'assistant'
      delta: string
      text: string
    }
  | {
      threadId: string
      type: 'message-completed'
      turnId: string | null
      itemId: string
      role: 'user' | 'assistant'
      text: string
    }
  | {
      threadId: string
      type: 'runtime-event'
      text: string
    }
  | {
      threadId: string
      type: 'thread-status'
      status: SessionSummary['status']
    }
  | {
      threadId: string | null
      type: 'error'
      message: string
    }

export type TurnMode = 'reply' | 'implement'

export type ThreadBackend = {
  listThreads: (limit?: number) => Promise<SessionSummary[]>
  createThread: (title?: string) => Promise<SessionDetail>
  readThread: (threadId: string) => Promise<SessionDetail | null>
  resumeThread: (threadId: string) => Promise<SessionDetail | null>
  startTurn: (threadId: string, text: string, mode: TurnMode) => Promise<{ threadId: string; turnId: string }>
  interruptTurn: (threadId: string) => Promise<boolean>
  getRuntime: (threadId: string) => RuntimeSnapshot
  subscribe: (listener: (event: ThreadEvent) => void) => () => void
  close?: () => Promise<void>
}

export function createEmptyRuntimeSnapshot(threadId: string): RuntimeSnapshot {
  return {
    threadId,
    running: false,
    turnId: null,
    status: 'idle',
    lastAgentText: '',
    events: [],
    error: null,
  }
}
