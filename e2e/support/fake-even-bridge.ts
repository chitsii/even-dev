import type { Page } from '@playwright/test'

type FakeDeviceStatus = {
  sn: string
  connectType: string
  batteryLevel?: number
  isWearing?: boolean
  isCharging?: boolean
  isInCase?: boolean
}

type FakeBridgeCall = {
  name: string
  method: string
  data: unknown
}

export async function installFakeEvenBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      calls: [] as Array<{ name: string; method: string; data: unknown }>,
    }

    const defaultStatus = {
      sn: 'PW-G2-001',
      connectType: 'connected',
      batteryLevel: 87,
      isWearing: true,
      isCharging: false,
      isInCase: false,
    }

    const defaultDeviceInfo = {
      model: 'g2',
      sn: defaultStatus.sn,
      status: defaultStatus,
    }

    const defaultUserInfo = {
      uid: 1,
      name: 'Playwright',
      avatar: '',
      country: 'JP',
    }

    const parsePayload = (payload: unknown): { method: string; data: unknown } => {
      if (typeof payload === 'string') {
        try {
          return JSON.parse(payload) as { method: string; data: unknown }
        } catch {
          return { method: '', data: undefined }
        }
      }

      if (payload && typeof payload === 'object') {
        const record = payload as { method?: unknown; data?: unknown }
        return {
          method: typeof record.method === 'string' ? record.method : '',
          data: record.data,
        }
      }

      return { method: '', data: undefined }
    }

    Object.defineProperty(window, 'flutter_inappwebview', {
      configurable: true,
      value: {
        callHandler(name: string, payload: unknown) {
          const request = parsePayload(payload)
          state.calls.push({
            name,
            method: request.method,
            data: request.data,
          })

          switch (request.method) {
            case 'getUserInfo':
              return Promise.resolve(defaultUserInfo)
            case 'getGlassesInfo':
              return Promise.resolve(defaultDeviceInfo)
            case 'setLocalStorage':
              return Promise.resolve(true)
            case 'getLocalStorage':
              return Promise.resolve('')
            case 'createStartUpPageContainer':
              return Promise.resolve(0)
            case 'rebuildPageContainer':
            case 'textContainerUpgrade':
            case 'audioControl':
            case 'imuControl':
            case 'shutDownPageContainer':
              return Promise.resolve(true)
            case 'updateImageRawData':
              return Promise.resolve('success')
            default:
              return Promise.resolve(true)
          }
        },
      },
    })

    ;(window as typeof window & {
      __EVEN_TEST_BRIDGE__?: {
        getCalls: () => FakeBridgeCall[]
        resetCalls: () => void
        setTranscript: (text: string) => void
        emitLaunchSource: (source?: string) => void
        emitDeviceStatusChanged: (status: FakeDeviceStatus) => void
        emitEvenHubEvent: (type: string, payload: Record<string, unknown>) => void
      }
    }).__EVEN_TEST_BRIDGE__ = {
      getCalls: () => state.calls.slice(),
      resetCalls: () => {
        state.calls.length = 0
      },
      setTranscript: (text: string) => {
        ;(window as typeof window & {
          __AGENT_TERMINAL_TEST_TRANSCRIPT__?: string
        }).__AGENT_TERMINAL_TEST_TRANSCRIPT__ = text
      },
      emitLaunchSource: (source = 'appMenu') => {
        window._listenEvenAppMessage?.({
          method: 'evenAppLaunchSource',
          data: { launchSource: source },
        })
      },
      emitDeviceStatusChanged: (status: FakeDeviceStatus) => {
        window._listenEvenAppMessage?.({
          method: 'deviceStatusChanged',
          data: status,
        })
      },
      emitEvenHubEvent: (type: string, payload: Record<string, unknown>) => {
        window._listenEvenAppMessage?.({
          method: 'evenHubEvent',
          data: {
            type,
            jsonData: payload,
          },
        })
      },
    }
  })
}

export async function getBridgeCallMethods(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return window.__EVEN_TEST_BRIDGE__?.getCalls().map((call) => call.method) ?? []
  })
}

export async function resetBridgeCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__EVEN_TEST_BRIDGE__?.resetCalls()
  })
}

export async function emitListEvent(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((eventPayload) => {
    window.__EVEN_TEST_BRIDGE__?.emitEvenHubEvent('listEvent', eventPayload)
  }, payload)
}

export async function emitAudioEvent(page: Page, audioPcm: number[]): Promise<void> {
  await page.evaluate((payload) => {
    window.__EVEN_TEST_BRIDGE__?.emitEvenHubEvent('audioEvent', { audioPcm: payload })
  }, audioPcm)
}

export async function setMockTranscript(page: Page, text: string): Promise<void> {
  await page.evaluate((transcript) => {
    window.__EVEN_TEST_BRIDGE__?.setTranscript(transcript)
  }, text)
}

declare global {
  interface Window {
    _listenEvenAppMessage?: (message: unknown) => void
    __AGENT_TERMINAL_TEST_TRANSCRIPT__?: string
    __EVEN_TEST_BRIDGE__?: {
      getCalls: () => FakeBridgeCall[]
      resetCalls: () => void
      setTranscript: (text: string) => void
      emitLaunchSource: (source?: string) => void
      emitDeviceStatusChanged: (status: FakeDeviceStatus) => void
      emitEvenHubEvent: (type: string, payload: Record<string, unknown>) => void
    }
  }
}
