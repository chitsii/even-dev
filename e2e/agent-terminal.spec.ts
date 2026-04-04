import { expect, test } from '@playwright/test'
import {
  emitListEvent,
  emitAudioEvent,
  getBridgeCallMethods,
  installFakeEvenBridge,
} from './support/fake-even-bridge'

test.beforeEach(async ({ page }) => {
  await installFakeEvenBridge(page)
})

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

test('glasses session list can create a new session when no sessions exist', async ({ page }) => {
  await page.goto('/')

  await emitListEvent(page, {
    containerName: 'sess-list',
    currentSelectItemIndex: 0,
    currentSelectItemName: 'Create New Session',
    type: 0,
  })

  await expect(page.locator('#topbar-session-title')).toContainText('Session')
  await expect(page.locator('#session-list [data-thread-id]')).toHaveCount(1)
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

test('push-to-talk creates a local draft segment without sending it yet', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()

  await page.getByRole('button', { name: 'Hold To Talk' }).click()
  await expect(page.locator('#voice-state')).toContainText('Listening')

  await emitAudioEvent(page, [1, 2, 3, 4])
  await emitAudioEvent(page, [5, 6, 7, 8])

  await page.getByRole('button', { name: 'Stop Recording' }).click()

  await expect(page.locator('#voice-state')).toContainText('Ready')
  await expect(page.getByLabel('Local reply draft')).toHaveValue(/Voice note received\./)
  await expect(page.locator('#conversation-history')).not.toContainText('Voice note received.')

  const methods = await getBridgeCallMethods(page)
  const audioCalls = methods.filter((method) => method === 'audioControl')
  expect(audioCalls).toEqual(['audioControl', 'audioControl'])
})

test('send uses the current draft directly and keeps stop hidden when idle', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Session' }).click()

  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden()
  await page.getByLabel('Local reply draft').fill('Send the current draft without extra staging.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.locator('#conversation-history')).toContainText('Send the current draft without extra staging.')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('#runtime-status')).toContainText(/Status: completed|状態: completed/)
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden()
})
