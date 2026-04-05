export type VoiceChunk = Uint8Array | number[]

export type VoiceSessionStats = {
  chunkCount: number
  byteLength: number
}

export type VoiceSession = {
  start: () => void
  pushChunk: (chunk: VoiceChunk) => void
  stop: () => VoiceSessionStats
  isRecording: () => boolean
  getStats: () => VoiceSessionStats
}

export function createVoiceSession(): VoiceSession {
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

    stop() {
      if (!recording) {
        return { chunkCount: 0, byteLength: 0 }
      }

      recording = false
      const stats = { chunkCount, byteLength }
      reset()
      return stats
    },

    isRecording() {
      return recording
    },

    getStats() {
      return { chunkCount, byteLength }
    },
  }
}
