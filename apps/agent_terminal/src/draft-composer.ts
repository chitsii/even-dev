export function composeDraftText(segments: readonly string[], input: string): string {
  return [...segments, input.trim()].filter(Boolean).join('\n').trim()
}

export function appendDraftSegment(segments: readonly string[], text: string): string[] {
  const normalized = text.trim()
  if (!normalized) {
    return [...segments]
  }
  return [...segments, normalized]
}

export function dropLastDraftSegment(segments: readonly string[]): string[] {
  if (segments.length === 0) {
    return []
  }
  return segments.slice(0, -1)
}
