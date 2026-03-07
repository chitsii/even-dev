import './styles.css'
import { createAutoConnector } from '../../_shared/autoconnect'
import {
  applyConnectionPillPhase,
  inferConnectionPillPhaseFromStatus,
  type ConnectionPillPhase,
} from '../../_shared/connection-pill'
import { createClockActions, type ClockActions } from './clock-app'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app')
}

appRoot.innerHTML = `
  <header class="hero card">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1 class="page-title">Clock</h1>
      <p class="page-subtitle">Standalone clock app for Even G2 simulator. Connect and toggle ticking.</p>
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
      <button id="left-btn" class="btn" type="button">Move Time Left</button>
      <button id="right-btn" class="btn" type="button">Move Time Right</button>
    </div>
    <p id="status" class="status">Clock app ready</p>
  </section>

  <section class="card">
    <p class="log-title">Event Log</p>
    <pre id="event-log" aria-live="polite"></pre>
  </section>
`

const statusEl = document.querySelector<HTMLParagraphElement>('#status')
const heroPillEl = document.querySelector<HTMLDivElement>('#hero-pill')
const connectBtn = document.querySelector<HTMLButtonElement>('#connect-btn')
const leftBtn = document.querySelector<HTMLButtonElement>('#left-btn')
const rightBtn = document.querySelector<HTMLButtonElement>('#right-btn')

if (!statusEl || !heroPillEl || !connectBtn || !leftBtn || !rightBtn) {
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

const actions: ClockActions = createClockActions(setStatus)

setConnectionPhase('idle')

const connector = createAutoConnector({
  connect: actions.connect,
  onConnecting: () => {
    setConnectionPhase('connecting')
  },
})
connector.bind(connectBtn)

leftBtn.addEventListener('click', () => {
  void actions.moveLeft()
})

rightBtn.addEventListener('click', () => {
  void actions.moveRight()
})
