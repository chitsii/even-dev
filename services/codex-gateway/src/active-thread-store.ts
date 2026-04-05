import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

type ActiveThreadRecord = {
  threadId: string | null
}

export type ActiveThreadStore = {
  getThreadId: () => string | null
  setThreadId: (threadId: string | null) => void
}

function readRecord(filePath: string): ActiveThreadRecord {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<ActiveThreadRecord>
    return {
      threadId: typeof parsed.threadId === 'string' && parsed.threadId.trim() ? parsed.threadId.trim() : null,
    }
  } catch {
    return { threadId: null }
  }
}

export function createActiveThreadStore(filePath: string): ActiveThreadStore {
  mkdirSync(dirname(filePath), { recursive: true })

  let currentThreadId = readRecord(filePath).threadId

  const persist = (): void => {
    writeFileSync(filePath, JSON.stringify({ threadId: currentThreadId }, null, 2), 'utf8')
  }

  return {
    getThreadId: () => currentThreadId,
    setThreadId: (threadId: string | null) => {
      currentThreadId = typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null
      persist()
    },
  }
}
