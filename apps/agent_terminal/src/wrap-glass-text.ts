export function wrapGlassText(text: string, width: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const rawLines = normalized.split('\n')
  const wrapped: string[] = []

  for (const rawLine of rawLines) {
    if (!rawLine) {
      wrapped.push('')
      continue
    }

    let remaining = rawLine
    while (remaining.length > width) {
      const candidate = remaining.slice(0, width)
      const splitAt = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'))

      if (splitAt > Math.floor(width * 0.7)) {
        wrapped.push(candidate.slice(0, splitAt).trimEnd())
        remaining = remaining.slice(splitAt + 1).trimStart()
      } else {
        wrapped.push(candidate)
        remaining = remaining.slice(width)
      }
    }

    wrapped.push(remaining)
  }

  return wrapped
}
