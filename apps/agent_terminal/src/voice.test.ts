import { describe, expect, it } from 'vitest'
import { createVoiceSession } from './voice'

describe('createVoiceSession', () => {
  it('collects pcm chunks and returns a transcript on stop', async () => {
    const session = createVoiceSession({
      transcribe: async ({ chunkCount, byteLength }) => `chunks=${chunkCount};bytes=${byteLength}`,
    })

    session.start()
    session.pushChunk(new Uint8Array([1, 2, 3]))
    session.pushChunk([4, 5])

    const transcript = await session.stop()

    expect(transcript).toBe('chunks=2;bytes=5')
  })

  it('ignores audio when recording is not active', async () => {
    const session = createVoiceSession({
      transcribe: async ({ chunkCount, byteLength }) => `chunks=${chunkCount};bytes=${byteLength}`,
    })

    session.pushChunk(new Uint8Array([1, 2, 3]))
    const transcript = await session.stop()

    expect(transcript).toBe('')
  })
})
