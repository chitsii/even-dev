import './styles.css'
import { createAutoConnector } from '../../_shared/autoconnect'
import {
  applyConnectionPillPhase,
  inferConnectionPillPhaseFromStatus,
  type ConnectionPillPhase,
} from '../../_shared/connection-pill'
import { createBaseAppActions, type BaseTemplateActions } from './base-template'

const appRoot = document.querySelector<HTMLDivElement>('#app')

if (!appRoot) {
  throw new Error('Missing #app')
}

appRoot.innerHTML = `
  <header class="hero card">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1 class="page-title">Base Template</h1>
      <p class="page-subtitle">Standalone template app with browser preview panel and glasses sync.</p>
    </div>
    <div id="hero-pill" class="hero-pill is-ready" aria-live="polite">Ready</div>
  </header>

  <section class="card">
    <div class="top-actions">
      <button id="connect-btn" class="btn btn-primary connect-glasses-btn" type="button">Connect glasses</button>
    </div>
  </section>

  <section class="card">
    <div class="row">
      <button id="plus-btn" class="btn" type="button">Counter +1</button>
      <button id="minus-btn" class="btn" type="button">Counter -1</button>
      <button id="reset-btn" class="btn" type="button">Reset</button>
      <button id="sync-btn" class="btn" type="button">Sync Glasses</button>
    </div>
    <p id="status" class="status-line">Base template ready</p>
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
const minusBtn = document.querySelector<HTMLButtonElement>('#minus-btn')
const plusBtn = document.querySelector<HTMLButtonElement>('#plus-btn')
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')
const syncBtn = document.querySelector<HTMLButtonElement>('#sync-btn')

if (!statusEl || !logEl || !heroPillEl || !connectBtn || !minusBtn || !plusBtn || !resetBtn || !syncBtn) {
  throw new Error('Missing controls')
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

const actions: BaseTemplateActions = createBaseAppActions(setStatus)

const logCard = logEl.closest('.card')
if (logCard) {
  appRoot.appendChild(logCard)
}

setConnectionPhase('idle')

const connector = createAutoConnector({
  connect: actions.connect,
  onConnecting: () => {
    setConnectionPhase('connecting')
  },
})
connector.bind(connectBtn)

minusBtn.addEventListener('click', () => {
  void actions.decrementCounter()
})

plusBtn.addEventListener('click', () => {
  void actions.incrementCounter('web: counter +1')
})

resetBtn.addEventListener('click', () => {
  void actions.resetCounter()
})

syncBtn.addEventListener('click', () => {
  void actions.syncGlasses()
})
