import './styles.css'
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app')
}

app.innerHTML = `
  <header class="hero card">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1 class="page-title">Hello World</h1>
      <p class="page-subtitle">Minimal standalone app that renders <code>Hello World</code> on the glasses.</p>
    </div>
    <div id="hero-pill" class="hero-pill">Ready</div>
  </header>

  <section class="card">
    <button id="connect-btn" class="btn" type="button">Connect and Render</button>
    <p class="message">Hello World</p>
    <p id="status" class="status">Waiting to render on glasses.</p>
  </section>
`

const heroPill = document.querySelector<HTMLDivElement>('#hero-pill')
const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')
const status = document.querySelector<HTMLParagraphElement>('#status')

if (!heroPill || !connectBtn || !status) {
  throw new Error('Missing UI elements')
}

let startupRendered = false

function setPhase(phase: 'ready' | 'connecting' | 'connected' | 'mock' | 'error'): void {
  const config = {
    ready: { label: 'Ready', className: '' },
    connecting: { label: 'Connecting', className: 'is-connecting' },
    connected: { label: 'Connected', className: 'is-connected' },
    mock: { label: 'Mock Mode', className: 'is-mock' },
    error: { label: 'Error', className: 'is-error' },
  } as const

  const next = config[phase]
  heroPill.textContent = next.label
  heroPill.className = next.className ? `hero-pill ${next.className}` : 'hero-pill'
}

async function renderHelloWorld(): Promise<void> {
  setPhase('connecting')
  status.textContent = 'Connecting to Even bridge...'

  try {
    const bridge = await waitForEvenAppBridge()

    const page = new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [new TextContainerProperty({
        containerID: 1,
        containerName: 'hello-world-text',
        content: 'Hello World',
        xPosition: 8,
        yPosition: 96,
        width: 560,
        height: 48,
        isEventCapture: 1,
      })],
    })

    const result = startupRendered
      ? await bridge.rebuildPageContainer(new RebuildPageContainer(page.toJson()))
      : await bridge.createStartUpPageContainer(page)

    if (result === 0 || result === true) {
      startupRendered = true
      setPhase('connected')
      status.textContent = 'Rendered "Hello World" on the glasses.'
      return
    }

    setPhase('error')
    status.textContent = `Render failed. Even Hub result code: ${result}`
  } catch (error) {
    console.error('[hello_world] bridge unavailable', error)
    setPhase('mock')
    status.textContent = 'Bridge unavailable. Browser preview is active, but nothing was sent to glasses.'
  }
}

connectBtn.addEventListener('click', () => {
  void renderHelloWorld()
})
