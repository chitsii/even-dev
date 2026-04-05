import { describe, expect, it } from 'vitest'
import { parseDotEnv } from './env.ts'

describe('parseDotEnv', () => {
  it('parses simple key value pairs and ignores comments', () => {
    const parsed = parseDotEnv(`
# comment
HOST=0.0.0.0
PORT=8791
`)

    expect(parsed).toEqual({
      HOST: '0.0.0.0',
      PORT: '8791',
    })
  })

  it('supports export prefixes and quoted values', () => {
    const parsed = parseDotEnv(`
export OPENAI_API_KEY="sk-test"
CODEX_GATEWAY_WORKSPACE_PATH='/c/Users/tishi/programming/eveng2/even-dev'
`)

    expect(parsed).toEqual({
      OPENAI_API_KEY: 'sk-test',
      CODEX_GATEWAY_WORKSPACE_PATH: '/c/Users/tishi/programming/eveng2/even-dev',
    })
  })
})
