import type { SessionDetail, ThreadBackend } from './thread-backend.ts'

type ChatCompletionRequest = {
  model?: string
  messages?: Array<{
    role?: string
    content?: unknown
  }>
}

export type VoiceEntryResult = {
  detail: SessionDetail | null
  turnStarted: boolean
  replyText: string
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return ''
        }
        const record = item as { type?: unknown; text?: unknown }
        return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

export function extractLatestUserText(body: ChatCompletionRequest): string {
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') {
      continue
    }
    const text = normalizeMessageContent(message.content)
    if (text) {
      return text
    }
  }
  return ''
}

export async function runVoiceEntryCommand(
  backend: ThreadBackend,
  activeThreadId: string | null,
  text: string,
): Promise<VoiceEntryResult> {
  const prompt = text.trim()
  if (!activeThreadId) {
    return {
      detail: null,
      turnStarted: false,
      replyText: 'No active session selected.',
    }
  }

  const detail = await backend.resumeThread(activeThreadId) ?? await backend.readThread(activeThreadId)
  if (!detail) {
    return {
      detail: null,
      turnStarted: false,
      replyText: 'Active session not found.',
    }
  }

  if (!prompt) {
    return {
      detail,
      turnStarted: false,
      replyText: `Ready for ${detail.title}.`,
    }
  }

  await backend.startTurn(detail.threadId, prompt, 'reply')
  return {
    detail,
    turnStarted: true,
    replyText: `Sent to ${detail.title}.`,
  }
}

export function createVoiceEntryChatCompletion(body: ChatCompletionRequest, result: VoiceEntryResult): Record<string, unknown> {
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'codex-gateway-voice-entry'
  const created = Math.floor(Date.now() / 1000)
  return {
    id: `chatcmpl_${Math.random().toString(36).slice(2, 10)}`,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: result.replyText,
        },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    thread: {
      id: result.detail?.threadId ?? null,
      title: result.detail?.title ?? null,
      turn_started: result.turnStarted,
    },
  }
}

export function isAuthorizedVoiceEntryRequest(headers: Headers, expectedToken?: string): boolean {
  const expected = expectedToken?.trim()
  if (!expected) {
    return true
  }
  const rawAuthorization = headers.get('authorization')?.trim() ?? ''
  const bearerMatch = rawAuthorization.match(/^Bearer\s+(.+)$/i)
  const provided = bearerMatch?.[1]?.trim() ?? ''
  return provided === expected
}
