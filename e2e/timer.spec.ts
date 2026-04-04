import { expect, test } from '@playwright/test'
import { emitListEvent, getBridgeCallMethods, installFakeEvenBridge, resetBridgeCalls } from './support/fake-even-bridge'

test.beforeEach(async ({ page }) => {
  await installFakeEvenBridge(page)
})

test('timer app starts from browser UI and stops on glasses double click', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('#hero-pill')).toHaveText('Connected')
  await expect(page.locator('#countdown-value')).toHaveText('01:00')

  await resetBridgeCalls(page)
  await page.getByRole('button', { name: /Start Timer/i }).click()

  await expect(page.locator('#hero-pill')).toHaveText('Running')
  await expect(page.locator('#event-log')).toContainText('Timer: started 01:00')

  await page.waitForTimeout(1_100)
  await expect(page.locator('#countdown-value')).toHaveText('00:59')

  await emitListEvent(page, {
    eventType: 'DOUBLE_CLICK_EVENT',
    containerID: 2,
    containerName: 'timer-hidden-capture',
  })

  await expect(page.locator('#hero-pill')).toHaveText('Connected')
  await expect(page.locator('#event-log')).toContainText('Timer: stopped')

  const methods = await getBridgeCallMethods(page)
  expect(methods).toContain('rebuildPageContainer')
})
