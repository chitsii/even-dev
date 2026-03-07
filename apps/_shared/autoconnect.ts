export type AutoConnectOptions = {
  connect: () => Promise<void>
  onConnecting?: () => void | Promise<void>
  onConnected?: () => void | Promise<void>
  onError?: (error: unknown) => void
}

function defaultOnError(error: unknown): void {
  console.error('[autoconnect] connect failed', error)
}

export function createAutoConnector(options: AutoConnectOptions) {
  let connectInFlight: Promise<void> | null = null

  async function connect(): Promise<void> {
    if (connectInFlight) {
      await connectInFlight
      return
    }

    connectInFlight = (async () => {
      if (options.onConnecting) {
        await options.onConnecting()
      }
      await options.connect()
      if (options.onConnected) {
        await options.onConnected()
      }
    })()

    try {
      await connectInFlight
    } finally {
      connectInFlight = null
    }
  }

  function triggerConnect(): void {
    void connect().catch((error) => {
      const onError = options.onError ?? defaultOnError
      onError(error)
    })
  }

  function bind(button: HTMLButtonElement, autoStart = true): void {
    button.addEventListener('click', () => {
      triggerConnect()
    })

    if (autoStart) {
      triggerConnect()
    }
  }

  return {
    bind,
    connect,
    triggerConnect,
  }
}
