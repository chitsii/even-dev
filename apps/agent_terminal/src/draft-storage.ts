const DRAFT_STORAGE_KEY = 'agent-terminal.thread-drafts.v1'

type StoredDrafts = Record<string, string[]>

function readDrafts(): StoredDrafts {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    return JSON.parse(raw) as StoredDrafts
  } catch {
    return {}
  }
}

function writeDrafts(next: StoredDrafts): void {
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures.
  }
}

export function loadThreadDraft(threadId: string): string[] {
  return readDrafts()[threadId] ?? []
}

export function saveThreadDraft(threadId: string, segments: string[]): void {
  const drafts = readDrafts()
  if (segments.length === 0) {
    delete drafts[threadId]
  } else {
    drafts[threadId] = segments
  }
  writeDrafts(drafts)
}

export function clearThreadDraft(threadId: string): void {
  const drafts = readDrafts()
  delete drafts[threadId]
  writeDrafts(drafts)
}
