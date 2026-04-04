type VoiceChunk = Uint8Array | number[]

export type VoiceSessionStats = {
  taskId: string
  chunkCount: number
  byteLength: number
}

export type VoiceSessionManager = ReturnType<typeof createVoiceSessionManager>

export function createVoiceSessionManager(options: {
  transcribe: (stats: VoiceSessionStats) => Promise<string>
}) {
  const sessions = new Map<string, { chunkCount: number; byteLength: number }>()

  return {
    start(taskId: string): void {
      sessions.set(taskId, { chunkCount: 0, byteLength: 0 })
    },

    pushChunk(taskId: string, chunk: VoiceChunk): void {
      const current = sessions.get(taskId)
      if (!current) {
        return
      }

      current.chunkCount += 1
      current.byteLength += chunk instanceof Uint8Array ? chunk.byteLength : chunk.length
    },

    async stop(taskId: string): Promise<{ transcript: string; stats: VoiceSessionStats }> {
      const current = sessions.get(taskId) ?? { chunkCount: 0, byteLength: 0 }
      sessions.delete(taskId)

      const stats: VoiceSessionStats = {
        taskId,
        chunkCount: current.chunkCount,
        byteLength: current.byteLength,
      }

      if (stats.chunkCount === 0) {
        return { transcript: '', stats }
      }

      const transcript = await options.transcribe(stats)
      return { transcript, stats }
    },
  }
}
