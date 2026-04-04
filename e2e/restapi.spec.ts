import { expect, test } from '@playwright/test'
import { getBridgeCallMethods, installFakeEvenBridge } from './support/fake-even-bridge'

test.beforeEach(async ({ page }) => {
  await installFakeEvenBridge(page)

  await page.route('**/__restapi_proxy**', async (route) => {
    const target = new URL(route.request().url()).searchParams.get('url') ?? ''

    const body = target.includes('/clock')
      ? JSON.stringify({
          state: true,
          result: {
            online: true,
            hour: 12,
            minute: 34,
          },
        })
      : JSON.stringify({
          state: true,
          result: 'ok',
        })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body,
    })
  })
})

test('restapi app runs a request and renders the response', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('#status')).toContainText('REST API ready.')
  await expect(page.locator('#restapi-controls')).toBeVisible()

  await page.getByRole('button', { name: /Run GET Request/i }).click()

  await expect(page.locator('#status')).toContainText('GET complete: 200 OK')
  await expect(page.locator('#restapi-response')).toContainText('"online": true')
  await expect(page.locator('#event-log')).toContainText('REST API: 200 OK')

  const methods = await getBridgeCallMethods(page)
  expect(methods).toContain('createStartUpPageContainer')
  expect(methods.some((method) => method === 'textContainerUpgrade' || method === 'rebuildPageContainer')).toBeTruthy()
})
