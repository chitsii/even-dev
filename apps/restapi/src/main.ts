import './styles.css'
import { createAutoConnector } from '../../_shared/autoconnect'
import {
  applyConnectionPillPhase,
  inferConnectionPillPhaseFromStatus,
  type ConnectionPillPhase,
} from '../../_shared/connection-pill'
import { createRestApiActions } from './restapi-app'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app')
}

appRoot.innerHTML = `
  <header class="hero card">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1 class="page-title">REST API</h1>
      <p class="page-subtitle">Standalone REST API tester with browser controls and glasses list navigation.</p>
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
      <button id="action-btn" class="btn" type="button">Run GET Request</button>
    </div>
    <p id="status" class="status">REST API app ready</p>
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
const actionBtn = document.querySelector<HTMLButtonElement>('#action-btn')

if (!statusEl || !logEl || !heroPillEl || !connectBtn || !actionBtn) {
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

const actions = createRestApiActions(setStatus)

// createRestApiActions() mounts #restapi-controls into #app on connect;
// keep event log at the end after dynamic UI insertion.
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

actionBtn.addEventListener('click', () => {
  void actions.action()
})
