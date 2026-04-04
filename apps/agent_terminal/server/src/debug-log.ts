import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function createFileDebugLogger(filename: string) {
  mkdirSync(dirname(filename), { recursive: true })

  return (entry: string): void => {
    appendFileSync(filename, `${entry}\n`, 'utf8')
  }
}
