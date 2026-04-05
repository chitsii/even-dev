import { existsSync, readFileSync } from 'node:fs'

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function parseDotEnv(contents: string): Record<string, string> {
  const entries: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const exportPrefix = line.startsWith('export ') ? 7 : 0
    const separatorIndex = line.indexOf('=', exportPrefix)
    if (separatorIndex <= exportPrefix) {
      continue
    }

    const key = line.slice(exportPrefix, separatorIndex).trim()
    if (!key) {
      continue
    }

    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim())
    entries[key] = value
  }

  return entries
}

export function loadDotEnvFile(path: string): boolean {
  if (!existsSync(path)) {
    return false
  }

  const parsed = parseDotEnv(readFileSync(path, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return true
}
