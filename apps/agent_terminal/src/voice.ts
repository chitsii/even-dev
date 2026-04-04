export type VoiceChunk = Uint8Array | number[]

export type VoiceSessionStats = {
  chunkCount: number
  byteLength: number
}

export type VoiceSessionOptions = {
  transcribe: (stats: VoiceSessionStats) => Promise<string>
}

export type VoiceSession = {
  start: () => void
  pushChunk: (chunk: VoiceChunk) => void
  stop: () => Promise<string>
  isRecording: () => boolean
  getStats: () => VoiceSessionStats
}

export function createVoiceSession(options: VoiceSessionOptions): VoiceSession {
  let recording = false
  let chunkCount = 0
  let byteLength = 0

  const reset = (): void => {
    chunkCount = 0
    byteLength = 0
  }

  return {
    start() {
      recording = true
      reset()
    },

    pushChunk(chunk) {
      if (!recording) {
        return
      }

      const length = chunk instanceof Uint8Array ? chunk.byteLength : chunk.length
      chunkCount += 1
      byteLength += length
    },

    async stop() {
      if (!recording) {
        return ''
      }

      recording = false
      const stats = { chunkCount, byteLength }
      const transcript = chunkCount > 0 ? await options.transcribe(stats) : ''
      reset()
      return transcript
    },

    isRecording() {
      return recording
    },

    getStats() {
      return { chunkCount, byteLength }
    },
  }
}

export async function transcribeVoiceStats(stats: VoiceSessionStats): Promise<string> {
  const globalWindow = window as typeof window & {
    __AGENT_TERMINAL_TEST_TRANSCRIPT__?: string
  }

  if (globalWindow.__AGENT_TERMINAL_TEST_TRANSCRIPT__) {
    return globalWindow.__AGENT_TERMINAL_TEST_TRANSCRIPT__
  }

  if (stats.chunkCount <= 0 || stats.byteLength <= 0) {
    return ''
  }

  return 'Voice note received.'
}
