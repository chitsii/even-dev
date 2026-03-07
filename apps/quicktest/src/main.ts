import './styles.css'
import { createAutoConnector } from '../../_shared/autoconnect'
import {
  applyConnectionPillPhase,
  inferConnectionPillPhaseFromStatus,
  type ConnectionPillPhase,
} from '../../_shared/connection-pill'
import { createQuicktestActions } from './quicktest-app'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app')
}

appRoot.innerHTML = `
  <header class="hero card">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1 class="page-title">Quicktest</h1>
      <p class="page-subtitle">Paste generated UI source and render it on the glasses for fast simulator testing.</p>
    </div>
    <div id="hero-pill" class="hero-pill is-ready" aria-live="polite">Ready</div>
  </header>

  <section class="card">
    <div class="top-actions">
      <button id="connect-btn" class="btn btn-primary connect-glasses-btn" type="button">Connect glasses</button>
    </div>
  </section>

  <section class="card">
    <div class="actions">
      <button id="render-btn" class="btn" type="button">Render Page</button>
      <button id="action-btn" class="btn" type="button">Reset Source To File</button>
    </div>
    <p id="status" class="status">Quicktest ready. Connect glasses, then click Render Page.</p>
  </section>

  <section class="card">
    <p class="log-title">Event Log</p>
    <pre id="event-log" aria-live="polite"></pre>
  </section>
`

const statusEl = document.querySelector<HTMLParagraphElement>('#status')
const logEl = document.querySelector<HTMLPreElement>('#event-log')
const heroPillEl = document.querySelector<HTMLDivElement>('#hero-pill')
const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')
const renderBtn = document.querySelector<HTMLButtonElement>('#render-btn')
const actionBtn = document.querySelector<HTMLButtonElement>('#action-btn')

if (!statusEl || !logEl || !heroPillEl || !connectBtn || !renderBtn || !actionBtn) {
  throw new Error('Missing UI controls')
}

function setConnectionPhase(phase: ConnectionPillPhase): void {
  applyConnectionPillPhase(heroPillEl, phase)
}

function setStatus(text: string): void {
  statusEl.textContent = text
  const inferred = inferConnectionPillPhaseFromStatus(text)
  if (inferred) {
    setConnectionPhase(inferred)
  }
}

const actions = createQuicktestActions(setStatus)

function moveLogCardToEnd(): void {
  const logCard = logEl.closest('.card')
  if (logCard) {
    appRoot.appendChild(logCard)
  }
}

const connector = createAutoConnector({
  connect: actions.connect,
  onConnecting: () => {
    setConnectionPhase('connecting')
  },
  onConnected: moveLogCardToEnd,
})
setConnectionPhase('idle')
connector.bind(connectBtn)

renderBtn.addEventListener('click', async () => {
  await actions.render()
  moveLogCardToEnd()
})

actionBtn.addEventListener('click', () => {
  void actions.action()
})
