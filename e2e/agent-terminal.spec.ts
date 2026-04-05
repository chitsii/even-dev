import { expect, test, type Page } from '@playwright/test'
import {
  emitAudioEvent,
  emitListEvent,
  emitSystemEvent,
  emitTextEvent,
  getBridgeCallMethods,
  installFakeEvenBridge,
} from './support/fake-even-bridge'

test.beforeEach(async ({ page }) => {
  await installFakeEvenBridge(page)
})

async function stubStt(page: Page, transcript: string | string[] = 'stub transcript'): Promise<void> {
  const transcripts = Array.isArray(transcript) ? [...transcript] : [transcript]
  await page.route('**/stt/sessions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId: 'stt-test-session' }),
    })
  })

  await page.route('**/stt/sessions/*/chunks', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('**/stt/sessions/*/finish', async (route) => {
    const nextTranscript = transcripts.length > 1 ? transcripts.shift() ?? '' : transcripts[0] ?? ''
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transcript: nextTranscript, chunkCount: 1, byteLength: 4 }),
    })
  })
}

test('boots into the session list and creates the initial glasses page', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('#topbar-session-title')).toContainText('No active session')
  await expect(page.locator('#session-list')).toContainText('No sessions yet')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('#runtime-status')).toContainText(/Glass: Rendered on glasses|Glass: Updated on glasses/)

  await expect.poll(async () => getBridgeCallMethods(page)).toContain('rebuildPageContainer')
  const methods = await getBridgeCallMethods(page)
  expect(methods).toContain('createStartUpPageContainer')
})

test('glasses standby can open sessions and create a new session when no sessions exist', async ({ page }) => {
  await page.goto('/')

  await emitTextEvent(page, {
    containerName: 'agt-body',
    eventType: 3,
  })
  await emitListEvent(page, {
    containerName: 'sess-list',
    currentSelectItemIndex: 0,
    currentSelectItemName: 'Create New Session',
    eventType: 0,
  })

  await expect(page.locator('#topbar-session-title')).toContainText('Session')
  await expect(page.locator('#session-list [data-thread-id]')).toHaveCount(1)
})

test('glasses standby can open sessions from a system double-click event', async ({ page }) => {
  await page.goto('/')

  await emitSystemEvent(page, {
    eventType: 3,
  })

  await emitListEvent(page, {
    containerName: 'sess-list',
    currentSelectItemIndex: 0,
    currentSelectItemName: 'Create New Session',
    eventType: 0,
  })

  await expect(page.locator('#topbar-session-title')).toContainText('Session')
})

test('glasses standby can open sessions from two rapid empty system events', async ({ page }) => {
  await page.goto('/')

  await emitSystemEvent(page, {})
  await emitSystemEvent(page, {})
  await emitListEvent(page, {
    containerName: 'sess-list',
    jsonData: JSON.stringify({ currentSelectItemIndex: 0 }),
    eventType: 0,
  })

  await expect(page.locator('#topbar-session-title')).toContainText('Session')
})

test('glasses standby falls back to create when rebuilding the sessions list fails', async ({ page }) => {
  await page.goto('/')

  await page.evaluate(() => {
    const bridge = window.__EVEN_TEST_BRIDGE__
    if (!bridge) return
    const original = window.flutter_inappwebview?.callHandler
    if (!original) return
    window.flutter_inappwebview.callHandler = (name: string, payload: unknown) => {
      const request = typeof payload === 'string' ? JSON.parse(payload) : payload as { method?: string; data?: unknown }
      if (request?.method === 'rebuildPageContainer') {
        const data = request.data as { textObject?: Array<{ containerName?: string }>; listObject?: Array<{ containerName?: string }> } | undefined
        const isSessionsPage = data?.listObject?.some((item) => item.containerName === 'sess-list')
        if (isSessionsPage) {
          return Promise.resolve(false)
        }
      }
      return original(name, payload)
    }
  })

  await emitSystemEvent(page, { eventType: 3 })
  await emitListEvent(page, {
    containerName: 'sess-list',
    currentSelectItemIndex: 0,
    currentSelectItemName: 'Create New Session',
    eventType: 0,
  })

  await expect(page.locator('#topbar-session-title')).toContainText('Session')
})

test('glasses detail tap starts recording and a second tap stops into draft review', async ({ page }) => {
  await stubStt(page, 'draft from glasses')
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await emitTextEvent(page, {
    containerName: 'agt-body',
    eventType: 0,
  })
  await expect(page.locator('#debug-log')).toHaveValue(/glass:detail:start-recording:(click|tap-like)/i)
  await emitAudioEvent(page, [1, 2, 3, 4])
  await emitTextEvent(page, {
    containerName: 'agt-body',
    eventType: 0,
  })

  await expect(page.getByLabel('Local reply draft')).not.toHaveValue('')
  await expect.poll(async () => {
    return page.evaluate(() => {
      return window.__EVEN_TEST_BRIDGE__?.getCalls().some((call) => {
        if (call.method !== 'rebuildPageContainer') {
          return false
        }
        const data = call.data as { listObject?: Array<{ containerName?: string }> } | undefined
        return data?.listObject?.some((item) => item.containerName === 'review-list') ?? false
      }) ?? false
    })
  }).toBe(true)
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/draft from glasses/i)
})

test('glasses detail double click stops recording and returns to review without an explicit click type', async ({ page }) => {
  await stubStt(page, 'double tap transcript')
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await emitTextEvent(page, {
    containerName: 'agt-body',
    eventType: 0,
  })
  await emitAudioEvent(page, [5, 6, 7, 8])
  await emitTextEvent(page, {
    containerName: 'agt-body',
    eventType: 3,
  })

  await expect.poll(async () => {
    return page.evaluate(() => {
      return window.__EVEN_TEST_BRIDGE__?.getCalls().some((call) => {
        if (call.method !== 'rebuildPageContainer') {
          return false
        }
        const data = call.data as { listObject?: Array<{ containerName?: string }> } | undefined
        return data?.listObject?.some((item) => item.containerName === 'review-list') ?? false
      }) ?? false
    })
  }).toBe(true)
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/double tap transcript/i)
})

test('draft review can continue recording and append another spoken segment', async ({ page }) => {
  await stubStt(page, ['first segment', 'second segment'])
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await emitTextEvent(page, { containerName: 'agt-body', eventType: 0 })
  await emitAudioEvent(page, [1, 1, 1, 1])
  await emitTextEvent(page, { containerName: 'agt-body', eventType: 3 })
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/first segment/i)

  await emitListEvent(page, {
    containerName: 'review-list',
    currentSelectItemIndex: 1,
    currentSelectItemName: 'Continue',
    eventType: 0,
  })
  await emitAudioEvent(page, [2, 2, 2, 2])
  await emitTextEvent(page, { containerName: 'agt-body', eventType: 3 })

  await expect(page.getByLabel('Local reply draft')).toHaveValue(/first segment\s+second segment/i)
})

test('draft review can redo only the last spoken segment', async ({ page }) => {
  await stubStt(page, ['first segment', 'replacement segment'])
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await emitTextEvent(page, { containerName: 'agt-body', eventType: 0 })
  await emitAudioEvent(page, [1, 1, 1, 1])
  await emitTextEvent(page, { containerName: 'agt-body', eventType: 3 })
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/first segment/i)

  await emitListEvent(page, {
    containerName: 'review-list',
    currentSelectItemIndex: 2,
    currentSelectItemName: 'Re-record',
    eventType: 0,
  })
  await emitAudioEvent(page, [3, 3, 3, 3])
  await emitTextEvent(page, { containerName: 'agt-body', eventType: 3 })

  await expect(page.getByLabel('Local reply draft')).toHaveValue(/replacement segment/i)
  await expect(page.getByLabel('Local reply draft')).not.toHaveValue(/first segment/i)
})

test('creates a session, sends a reply, and shows the conversation history', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await page.getByLabel('Local reply draft').fill('Please refine the glasses UX around session recovery.')
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/Please refine the glasses UX around session recovery\./)

  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.locator('#conversation-history')).toContainText('Please refine the glasses UX around session recovery.')
  await expect(page.locator('#conversation-history')).toContainText('Discussion Response')
  await expect(page.locator('#topbar-session-subtitle')).toContainText('Discussion Response')

  const methods = await getBridgeCallMethods(page)
  expect(methods).toContain('textContainerUpgrade')
})

test('a second app instance can reopen an existing session from the shared thread list', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')
  await page.getByLabel('Local reply draft').fill('Carry this thread across clients.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('#conversation-history')).toContainText('Discussion Response')

  const mirrorPage = await context.newPage()
  await installFakeEvenBridge(mirrorPage)
  await mirrorPage.goto('/')

  await expect(mirrorPage.locator('#session-list')).toContainText('Session')
  await mirrorPage.locator('#session-list [data-thread-id]').first().click()

  await expect(mirrorPage.locator('#topbar-session-title')).toContainText('Session')
  await expect(mirrorPage.locator('#conversation-history')).toContainText('Carry this thread across clients.')
  await expect(mirrorPage.locator('#conversation-history')).toContainText('Discussion Response')
})

test('session list refreshes in the background when another client creates a thread', async ({ page, context }) => {
  await page.goto('/')
  await page.waitForTimeout(1000)
  const initialCount = await page.locator('#session-list [data-thread-id]').count()

  const mirrorPage = await context.newPage()
  await installFakeEvenBridge(mirrorPage)
  await mirrorPage.goto('/')
  await mirrorPage.getByRole('button', { name: 'New Session' }).click()

  await expect(page.locator('#session-list [data-thread-id]')).toHaveCount(initialCount + 1, { timeout: 5000 })
})

test('send uses the current draft directly and keeps stop hidden when idle', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()
  await expect(page.locator('#topbar-session-title')).toContainText('Session')

  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden()
  await page.getByLabel('Local reply draft').fill('Send the current draft without extra staging.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.locator('#conversation-history')).toContainText('Send the current draft without extra staging.')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('#runtime-status')).toContainText(/Status: completed|状態: completed/)
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden()
})

test('gateway settings can probe connectivity before saving', async ({ page }) => {
  await page.route('http://gateway.test/api/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        backend: 'codex',
        workspacePath: '/tmp/workspace',
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Gateway' }).click()
  await page.locator('#gateway-input').fill('http://gateway.test/api')
  await page.locator('#gateway-token-input').fill('secret')
  await page.getByRole('button', { name: 'Check' }).click()

  await expect(page.locator('#gateway-probe-status')).toContainText('Connected: codex · /tmp/workspace')
  await expect(page.locator('#gateway-status')).toContainText('Local dev proxy')
})
