import { randomUUID } from 'node:crypto'

export type SttChunkStats = {
  chunkCount: number
  byteLength: number
}

export type SttFinishResult = SttChunkStats & {
  transcript: string
}

export type SttSessionStartOptions = {
  language?: string
}

export type SttSessionService = {
  startSession: (options?: SttSessionStartOptions) => { sessionId: string }
  appendChunk: (sessionId: string, chunk: Uint8Array) => Promise<SttChunkStats> | SttChunkStats
  finishSession: (sessionId: string) => Promise<SttFinishResult>
}

type AudioTranscriber = (audio: {
  wavBytes: Uint8Array
  mimeType: string
  sampleRate: number
  language?: string
}) => Promise<string>

function mergeChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const merged = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function pcm16MonoToWav(pcmBytes: Uint8Array, sampleRate = 16_000): Uint8Array {
  const headerSize = 44
  const wav = new Uint8Array(headerSize + pcmBytes.byteLength)
  const view = new DataView(wav.buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcmBytes.byteLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, pcmBytes.byteLength, true)
  wav.set(pcmBytes, headerSize)
  return wav
}

export function createSttSessionService(options: {
  transcribeAudio: AudioTranscriber
  sampleRate?: number
}): SttSessionService {
  const sampleRate = options.sampleRate ?? 16_000
  const sessions = new Map<string, { chunks: Uint8Array[]; chunkCount: number; byteLength: number; language: string }>()

  return {
    startSession(sessionOptions) {
      const sessionId = randomUUID()
      sessions.set(sessionId, {
        chunks: [],
        chunkCount: 0,
        byteLength: 0,
        language: sessionOptions?.language?.trim().toLowerCase() || '',
      })
      return { sessionId }
    },

    appendChunk(sessionId, chunk) {
      const current = sessions.get(sessionId)
      if (!current) {
        throw new Error('STT session not found')
      }
      const copy = new Uint8Array(chunk)
      current.chunks.push(copy)
      current.chunkCount += 1
      current.byteLength += copy.byteLength
      return {
        chunkCount: current.chunkCount,
        byteLength: current.byteLength,
      }
    },

    async finishSession(sessionId) {
      const current = sessions.get(sessionId)
      sessions.delete(sessionId)
      if (!current) {
        throw new Error('STT session not found')
      }

      if (current.byteLength <= 0) {
        return {
          transcript: '',
          chunkCount: 0,
          byteLength: 0,
        }
      }

      const pcmBytes = mergeChunks(current.chunks, current.byteLength)
      const wavBytes = pcm16MonoToWav(pcmBytes, sampleRate)
      const transcript = await options.transcribeAudio({
        wavBytes,
        mimeType: 'audio/wav',
        sampleRate,
        language: current.language,
      })
      return {
        transcript: transcript.trim(),
        chunkCount: current.chunkCount,
        byteLength: current.byteLength,
      }
    },
  }
}

export function createOpenAiSttTranscriber(options: {
  apiKey: string
  model?: string
  language?: string
}) {
  const apiKey = options.apiKey.trim()
  const model = options.model?.trim() || 'gpt-4o-mini-transcribe'
  const defaultLanguage = options.language?.trim().toLowerCase() || ''

  return async function transcribeAudio(audio: {
    wavBytes: Uint8Array
    mimeType: string
    language?: string
  }): Promise<string> {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const form = new FormData()
    form.append('file', new Blob([audio.wavBytes], { type: audio.mimeType }), 'recording.wav')
    form.append('model', model)
    const language = audio.language?.trim().toLowerCase() || defaultLanguage
    if (language) {
      form.append('language', language)
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`OpenAI STT failed: ${response.status} ${message}`.trim())
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const payload = await response.json() as { text?: string }
      return payload.text?.trim() ?? ''
    }

    return (await response.text()).trim()
  }
}
