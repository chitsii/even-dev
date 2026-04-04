export type AgentKind = 'claude-code' | 'codex'

export type AgentSessionConfig = {
  kind: AgentKind
  workspacePath: string
  repoPath?: string
  branch?: string
  env?: Record<string, string>
}

export type AgentPrompt = {
  text: string
  mode: 'discuss' | 'implement'
  metadata?: Record<string, unknown>
}

export type AgentAction =
  | { type: 'send-prompt'; prompt: AgentPrompt }
  | { type: 'interrupt' }
  | { type: 'approve'; approvalId: string }
  | { type: 'reject'; approvalId: string }
  | { type: 'ask'; text: string }

export type AgentEvent =
  | { type: 'session-started'; sessionId: string }
  | { type: 'status'; phase: 'idle' | 'thinking' | 'editing' | 'testing' | 'waiting-approval' | 'done' | 'error'; message: string }
  | { type: 'message'; mode: 'discuss' | 'implement'; text: string }
  | { type: 'summary'; text: string }
  | { type: 'approval-request'; approvalId: string; reason: string }
  | { type: 'file-change'; path: string }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }

export type AgentCapabilities = {
  supportsApproval: boolean
  supportsInterrupt: boolean
  supportsStructuredFileChanges: boolean
}

export interface AgentAdapter {
  kind: AgentKind
  capabilities: AgentCapabilities
  createSession(config: AgentSessionConfig): Promise<AgentRuntime>
}

export interface AgentRuntime {
  sessionId: string
  dispatch(action: AgentAction): Promise<void>
  subscribe(listener: (event: AgentEvent) => void): () => void
  close(): Promise<void>
}
