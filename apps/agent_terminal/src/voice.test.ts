import { describe, expect, it } from 'vitest'
import { createVoiceSession } from './voice'

describe('createVoiceSession', () => {
  it('collects pcm chunks and returns byte stats on stop', () => {
    const session = createVoiceSession()

    session.start()
    session.pushChunk(new Uint8Array([1, 2, 3]))
    session.pushChunk([4, 5])

    const stats = session.stop()

    expect(stats).toEqual({
      chunkCount: 2,
      byteLength: 5,
    })
  })

  it('ignores audio when recording is not active', () => {
    const session = createVoiceSession()

    session.pushChunk(new Uint8Array([1, 2, 3]))
    const stats = session.stop()

    expect(stats).toEqual({
      chunkCount: 0,
      byteLength: 0,
    })
  })
})
