import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { getRawEventType, normalizeEventType } from '../../_shared/even-events'
import {
  clearRemoteGatewayToken,
  clearRemoteGatewayUrl,
  getRemoteGatewayToken,
  getRemoteGatewayUrl,
  saveRemoteGatewayToken,
  saveRemoteGatewayUrl,
} from './runtime-config'
import { clearThreadDraft, loadThreadDraft, saveThreadDraft } from './draft-storage'
import {
  detectInitialLanguage,
  getTranslations,
  LANGUAGE_LABELS,
  saveLanguage,
  type LanguageCode,
} from './i18n'
import {
  createAgentTerminalTransport,
  type ConversationEntry,
  type RuntimeSnapshot,
  type SessionDetail,
  type SessionSummary,
  type ThreadEvent,
} from './transport'
import { createVoiceSession, transcribeVoiceStats } from './voice'
import { wrapGlassText } from './wrap-glass-text'

type AppMode = 'sessions' | 'reply' | 'implement'
type VoiceState = 'ready' | 'listening' | 'transcribing'
type TurnMode = 'reply' | 'implement'
type HubEventTypeMap = { CLICK_EVENT: number; SCROLL_TOP_EVENT: number; SCROLL_BOTTOM_EVENT: number; DOUBLE_CLICK_EVENT: number }
type GlassSessionEntry =
  | { kind: 'session'; label: string; session: SessionSummary }
  | { kind: 'create'; label: string }
type AppState = {
  mode: AppMode
  sessions: SessionSummary[]
  currentThreadId: string | null
  currentTitle: string
  messages: ConversationEntry[]
  draftSegments: string[]
  draftInput: string
  bridgeLabel: string
  voiceState: VoiceState
  voiceChunkCount: number
  runtime: RuntimeSnapshot | null
  gatewayInput: string
  gatewayUrl: string
  gatewayTokenInput: string
  gatewayToken: string
  language: LanguageCode
  sendFailed: boolean
  glassesEnabled: boolean
  glassStatus: string
  debugLog: string[]
  debugLogExpanded: boolean
  settingsOpen: boolean
  sessionsSheetOpen: boolean
}

const GLASS_WRAP_WIDTH = 38
const GLASS_VISIBLE_LINES = 8
const GLASS_HEADER_WIDTH = 30
const GLASS_STATUS_WIDTH = 5
const SESSION_LIMIT = 20
const GLASS_SESSION_LIMIT = 5
const SESSION_POLL_INTERVAL_MS = 5000
const RUNTIME_POLL_INTERVAL_MS = 1500
const POST_STARTUP_REBUILD_DELAY_MS = 1500
const GLASSES_ENABLED_STORAGE_KEY = 'even.agent_terminal.glasses_enabled.v1'
const GLASS_MESSAGE_CONTAINER_ID = 1
const GLASS_MESSAGE_CONTAINER_NAME = 'hello-world-text'
const GLASS_SESSIONS_TITLE_ID = 11
const GLASS_SESSIONS_TITLE_NAME = 'sess-title'
const GLASS_SESSIONS_LIST_ID = 12
const GLASS_SESSIONS_LIST_NAME = 'sess-list'
const HUB_EVENT_TYPES: HubEventTypeMap = { CLICK_EVENT: 0, SCROLL_TOP_EVENT: 1, SCROLL_BOTTOM_EVENT: 2, DOUBLE_CLICK_EVENT: 3 }

function loadGlassesEnabled(): boolean {
  try {
    return window.localStorage.getItem(GLASSES_ENABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveGlassesEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(GLASSES_ENABLED_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(GLASSES_ENABLED_STORAGE_KEY)
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function createEmptyRuntime(threadId: string): RuntimeSnapshot {
  return { threadId, running: false, turnId: null, status: 'idle', lastAgentText: '', events: [], error: null }
}

function trimPreview(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= length ? normalized : `${normalized.slice(0, Math.max(0, length - 3))}...`
}

function trimMultilinePreview(value: string, length: number): string {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
  return normalized.length <= length ? normalized : `${normalized.slice(0, Math.max(0, length - 3))}...`
}

function formatSessionTime(updatedAt: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt)
}

function formatAssistantMessageForGlasses(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const filtered: string[] = []
  for (const line of lines) {
    if (line === 'Discussion Response') {
      continue
    }
    if (line.startsWith('You said:')) {
      continue
    }
    if (line === 'Implementation Outline') {
      break
    }
    filtered.push(line)
  }

  return filtered.join('\n').trim() || text.trim()
}

export class AgentTerminalApp {
  private readonly root: HTMLDivElement
  private readonly instanceId = Math.random().toString(36).slice(2, 8)
  private readonly transport = createAgentTerminalTransport({
    getBasePath: () => this.state.gatewayUrl || '/__agent_terminal_api',
    getGatewayToken: () => this.state.gatewayToken,
  })
  private readonly voiceSession = createVoiceSession({
    transcribe: async (stats) => {
      const transcript = await transcribeVoiceStats(stats)
      if (transcript === 'Voice note received.') {
        return getTranslations(this.state.language).voice.noteReceived
      }
      return transcript
    },
  })
  private readonly state: AppState = {
    mode: 'sessions',
    sessions: [],
    currentThreadId: null,
    currentTitle: '',
    messages: [],
    draftSegments: [],
    draftInput: '',
    bridgeLabel: 'Connecting',
    voiceState: 'ready',
    voiceChunkCount: 0,
    runtime: null,
    gatewayInput: '',
    gatewayUrl: '',
    gatewayTokenInput: '',
    gatewayToken: '',
    language: detectInitialLanguage(),
    sendFailed: false,
    glassesEnabled: loadGlassesEnabled(),
    glassStatus: 'Waiting for bridge',
    debugLog: [],
    debugLogExpanded: false,
    settingsOpen: false,
    sessionsSheetOpen: false,
  }

  private bridge: EvenAppBridge | null = null
  private startupRendered = false
  private currentGlassView: 'startup' | 'sessions' | 'message' = 'startup'
  private lastRenderedGlassText = ''
  private sessionPollHandle: number | null = null
  private runtimePollHandle: number | null = null
  private unsubscribeThreadEvents: (() => void) | null = null
  private pendingTurnMode: TurnMode | null = null
  private pendingResponseWatchdogHandle: number | null = null

  constructor(root: HTMLDivElement) {
    this.root = root
  }

  async init(): Promise<void> {
    this.state.gatewayUrl = getRemoteGatewayUrl()
    this.state.gatewayInput = this.state.gatewayUrl
    this.state.gatewayToken = getRemoteGatewayToken()
    this.state.gatewayTokenInput = this.state.gatewayToken
    this.appendDebugLog('init:start')
    this.renderShell()
    this.bindUi()
    this.render()
    await this.connectBridge()
    await this.refreshSessions()
    this.startSessionPolling()
    this.startRuntimePolling()
    if (this.bridge) {
      this.state.glassesEnabled = true
      saveGlassesEnabled(true)
      await this.renderGlass()
    }
  }

  private renderShell(): void {
    const t = getTranslations(this.state.language)
    const languageOptions = LANGUAGE_LABELS.map((option) => `
      <option value="${option.value}"${option.value === this.state.language ? ' selected' : ''}>${option.label}</option>
    `).join('')
    this.root.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <div class="topbar-main">
            <div id="topbar-session-title" class="topbar-title">${this.escapeHtml(t.sessions.noActiveSession)}</div>
            <div id="topbar-session-subtitle" class="topbar-subtitle">${this.escapeHtml(t.sessions.openToRead)}</div>
          </div>
          <div class="topbar-actions">
            <button class="btn is-secondary mobile-only" id="open-sessions-btn" type="button">${this.escapeHtml(t.controls.openSessions)}</button>
            <button class="btn is-secondary" id="open-settings-btn" type="button">${this.escapeHtml(t.controls.openSettings)}</button>
          </div>
        </header>

        <div class="workspace-grid">
          <aside id="session-rail" class="session-rail${this.state.sessionsSheetOpen ? ' is-open' : ''}">
            <div class="rail-header">
              <h2>${this.escapeHtml(t.sessions.title)}</h2>
              <button class="icon-btn mobile-only" id="close-sessions-btn" type="button">${this.escapeHtml(t.controls.close)}</button>
            </div>
            <div class="rail-actions">
              <button class="btn" id="new-session-btn" type="button">${this.escapeHtml(t.controls.newSession)}</button>
              <button class="btn is-secondary" id="refresh-sessions-btn" type="button">${this.escapeHtml(t.controls.refreshSessions)}</button>
            </div>
            <ul id="session-list" class="session-list"></ul>
          </aside>

          <section class="conversation-shell">
            <ul id="conversation-history" class="chat-list conversation-list"></ul>
          </section>
        </div>

        <section class="composer-shell">
          <div class="composer-meta-row">
            <span id="voice-state" class="composer-meta">${this.escapeHtml(t.voice.ready)}</span>
            <span id="bridge-status-inline" class="composer-meta">${this.escapeHtml(t.runtime.bridge)}: --</span>
          </div>
          <div class="composer-row">
            <textarea id="draft-input" class="composer-input" aria-label="${this.escapeHtml(t.voice.draftLabel)}" placeholder="${this.escapeHtml(t.voice.draftPlaceholder)}"></textarea>
            <div class="composer-actions">
              <button class="btn is-secondary" id="voice-toggle-btn" type="button">${this.escapeHtml(t.controls.holdToTalk)}</button>
              <button class="btn" id="send-reply-btn" type="button">${this.escapeHtml(t.controls.sendReply)}</button>
              <button class="btn is-secondary" id="interrupt-turn-btn" type="button">${this.escapeHtml(t.controls.interrupt)}</button>
            </div>
          </div>
        </section>

        <div id="sheet-backdrop" class="sheet-backdrop${this.state.settingsOpen || this.state.sessionsSheetOpen ? ' is-open' : ''}"></div>

        <aside id="settings-sheet" class="settings-sheet${this.state.settingsOpen ? ' is-open' : ''}">
          <div class="rail-header">
            <h2>${this.escapeHtml(t.settings.title)}</h2>
            <button class="icon-btn" id="close-settings-btn" type="button">${this.escapeHtml(t.controls.close)}</button>
          </div>

          <section class="sheet-section">
            <label class="language-control" for="language-select">
              <span>${this.escapeHtml(t.controls.language)}</span>
              <select id="language-select" class="language-select">${languageOptions}</select>
            </label>
            <div class="controls-row">
              <button class="btn is-secondary" id="sync-glasses-btn" type="button">${this.escapeHtml(t.controls.syncGlasses)}</button>
            </div>
          </section>

          <section class="sheet-section">
            <h3>${this.escapeHtml(t.gateway.title)}</h3>
            <p id="gateway-status" class="bridge-status"></p>
            <div class="controls">
              <div>
                <label class="draft-label" for="gateway-input">${this.escapeHtml(t.gateway.remoteLabel)}</label>
                <input id="gateway-input" class="draft-input gateway-input" type="url" placeholder="${this.escapeHtml(t.gateway.remotePlaceholder)}" />
              </div>
              <div>
                <label class="draft-label" for="gateway-token-input">${this.escapeHtml(t.gateway.tokenLabel)}</label>
                <input id="gateway-token-input" class="draft-input gateway-input" type="password" placeholder="${this.escapeHtml(t.gateway.tokenPlaceholder)}" />
              </div>
              <div class="controls-row">
                <button class="btn" id="save-gateway-btn" type="button">${this.escapeHtml(t.controls.saveGateway)}</button>
                <button class="btn is-secondary" id="clear-gateway-btn" type="button">${this.escapeHtml(t.controls.useEmbeddedGateway)}</button>
              </div>
            </div>
          </section>

          <details class="settings-details">
            <summary>${this.escapeHtml(`${t.runtime.title} / ${t.debug.title}`)}</summary>
            <div class="settings-stack">
              <p class="bridge-status"><strong>${this.escapeHtml(t.runtime.bridge)}:</strong> <span id="bridge-status-text"></span></p>
              <p id="runtime-status" class="phase">${this.escapeHtml(t.runtime.noTurn)}</p>
              <ul id="runtime-events" class="event-list"></ul>
              <section class="sheet-section">
                <p class="panel-copy">${this.escapeHtml(t.debug.copy)}</p>
                <textarea id="debug-log" class="debug-log" readonly spellcheck="false"></textarea>
              </section>
            </div>
          </details>
        </aside>
      </main>
    `
  }

  private bindUi(): void {
    this.byId<HTMLInputElement>('gateway-input').addEventListener('input', (event) => {
      this.state.gatewayInput = (event.currentTarget as HTMLInputElement).value
    })
    this.byId<HTMLInputElement>('gateway-token-input').addEventListener('input', (event) => {
      this.state.gatewayTokenInput = (event.currentTarget as HTMLInputElement).value
    })
    this.byId<HTMLButtonElement>('save-gateway-btn').addEventListener('click', () => {
      void this.saveGateway()
    })
    this.byId<HTMLButtonElement>('clear-gateway-btn').addEventListener('click', () => {
      void this.clearGateway()
    })
    this.byId<HTMLButtonElement>('sync-glasses-btn').addEventListener('click', () => {
      void this.renderGlass()
    })
    this.byId<HTMLButtonElement>('refresh-sessions-btn').addEventListener('click', () => {
      void this.refreshSessions()
    })
    this.byId<HTMLButtonElement>('new-session-btn').addEventListener('click', () => {
      void this.createSession()
    })
    this.byId<HTMLButtonElement>('open-sessions-btn').addEventListener('click', () => {
      this.state.sessionsSheetOpen = true
      this.render()
    })
    this.byId<HTMLButtonElement>('close-sessions-btn').addEventListener('click', () => {
      this.state.sessionsSheetOpen = false
      this.render()
    })
    this.byId<HTMLButtonElement>('open-settings-btn').addEventListener('click', () => {
      this.state.settingsOpen = true
      this.render()
    })
    this.byId<HTMLButtonElement>('close-settings-btn').addEventListener('click', () => {
      this.state.settingsOpen = false
      this.render()
    })
    this.byId<HTMLDivElement>('sheet-backdrop').addEventListener('click', () => {
      this.state.settingsOpen = false
      this.state.sessionsSheetOpen = false
      this.render()
    })
    this.byId<HTMLUListElement>('session-list').addEventListener('click', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('[data-thread-id]')
      const threadId = item?.dataset.threadId
      if (threadId) {
        this.state.sessionsSheetOpen = false
        void this.openThread(threadId)
      }
    })
    this.byId<HTMLTextAreaElement>('draft-input').addEventListener('input', (event) => {
      this.state.draftInput = (event.currentTarget as HTMLTextAreaElement).value
      this.render()
      void this.renderGlass()
    })
    this.byId<HTMLButtonElement>('voice-toggle-btn').addEventListener('click', () => {
      void this.toggleVoiceRecording()
    })
    this.byId<HTMLButtonElement>('send-reply-btn').addEventListener('click', () => {
      void this.sendDraft('reply')
    })
    this.byId<HTMLButtonElement>('interrupt-turn-btn').addEventListener('click', () => {
      void this.interruptTurn()
    })
    this.byId<HTMLSelectElement>('language-select').addEventListener('change', (event) => {
      const nextLanguage = (event.currentTarget as HTMLSelectElement).value
      if (nextLanguage === 'ja' || nextLanguage === 'en') {
        void this.setLanguage(nextLanguage)
      }
    })
    const debugLog = this.root.querySelector<HTMLTextAreaElement>('#debug-log')
    if (debugLog) {
      debugLog.addEventListener('focus', () => {
        this.state.debugLogExpanded = true
        this.render()
      })
      debugLog.addEventListener('blur', () => {
        this.state.debugLogExpanded = false
        this.render()
      })
    }
  }

  private async connectBridge(): Promise<void> {
    try {
      this.appendDebugLog('bridge:connecting')
      this.bridge = await waitForEvenAppBridge()
      this.bridge.onEvenHubEvent((event) => {
        this.appendDebugLog(this.describeBridgeEvent(event))
        this.handleBridgeEvent(event)
      })
      this.state.bridgeLabel = 'Connected'
      this.appendDebugLog('bridge:connected')
    } catch {
      this.bridge = null
      this.state.bridgeLabel = 'Mock Mode'
      this.state.glassStatus = 'Bridge unavailable'
      this.appendDebugLog('bridge:mock-mode')
    }
    this.render()
  }

  private async saveGateway(): Promise<void> {
    this.state.gatewayUrl = saveRemoteGatewayUrl(this.state.gatewayInput)
    this.state.gatewayInput = this.state.gatewayUrl
    this.state.gatewayToken = saveRemoteGatewayToken(this.state.gatewayTokenInput)
    this.state.gatewayTokenInput = this.state.gatewayToken
    await this.refreshSessions()
    if (this.state.currentThreadId) {
      await this.openThread(this.state.currentThreadId)
      return
    }
    this.render()
    await this.renderGlass()
  }

  private async clearGateway(): Promise<void> {
    clearRemoteGatewayUrl()
    clearRemoteGatewayToken()
    this.state.gatewayUrl = ''
    this.state.gatewayInput = ''
    this.state.gatewayToken = ''
    this.state.gatewayTokenInput = ''
    await this.refreshSessions()
    if (this.state.currentThreadId) {
      await this.openThread(this.state.currentThreadId)
      return
    }
    this.render()
    await this.renderGlass()
  }

  private async setLanguage(language: LanguageCode): Promise<void> {
    if (language === this.state.language) {
      return
    }
    this.state.language = language
    saveLanguage(language)
    this.renderShell()
    this.bindUi()
    this.render()
    await this.renderGlass()
  }

  private async refreshSessions(): Promise<void> {
    try {
      this.state.sessions = await this.transport.listThreads()
      this.appendDebugLog(`sessions:loaded:${this.state.sessions.length}`)
    } catch (error) {
      this.state.sessions = []
      this.appendDebugLog(`sessions:load-failed:${error instanceof Error ? error.message : String(error)}`)
    }
    this.render()
    await this.renderGlass()
  }

  private startSessionPolling(): void {
    if (this.sessionPollHandle !== null) {
      return
    }
    this.sessionPollHandle = window.setInterval(() => {
      void this.refreshSessions()
    }, SESSION_POLL_INTERVAL_MS)
  }

  private startRuntimePolling(): void {
    if (this.runtimePollHandle !== null) {
      return
    }
    this.runtimePollHandle = window.setInterval(() => {
      void this.syncRuntimeState()
    }, RUNTIME_POLL_INTERVAL_MS)
  }

  private async syncRuntimeState(): Promise<void> {
    const threadId = this.state.currentThreadId
    if (!threadId || !this.state.runtime?.running) {
      return
    }

    try {
      const runtime = await this.transport.getRuntime(threadId)
      const current = this.state.runtime
      const changed = !current
        || current.running !== runtime.running
        || current.turnId !== runtime.turnId
        || current.status !== runtime.status
        || current.lastAgentText !== runtime.lastAgentText
        || current.error !== runtime.error
        || current.events.join('\n') !== runtime.events.join('\n')

      if (!changed) {
        return
      }

      this.appendDebugLog(`runtime:poll:${runtime.status}:${runtime.running ? 'running' : 'idle'}:${runtime.lastAgentText.length}`)
      this.state.runtime = runtime

      if (runtime.lastAgentText.trim()) {
        const existingAssistant = this.getLatestAssistantMessage()
        if (!existingAssistant || existingAssistant.text !== runtime.lastAgentText) {
          const detail = await this.transport.readThread(threadId)
          if (detail) {
            this.state.messages = detail.messages.slice()
          }
        }
      }

      if (!runtime.running && runtime.status !== 'running') {
        this.clearPendingResponseWatchdog()
        this.pendingTurnMode = null
        await this.refreshSessions()
        const detail = await this.transport.readThread(threadId)
        if (detail) {
          this.state.messages = detail.messages.slice()
        }
        if (this.state.mode === 'implement') {
          this.state.mode = 'reply'
        }
      }

      this.render()
      await this.renderGlass()
    } catch (error) {
      this.appendDebugLog(`runtime:poll:failed:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async createSession(): Promise<void> {
    const title = `Session ${new Date().toLocaleString('sv-SE').replace('T', ' ')}`
    this.appendDebugLog(`session:create:${title}`)
    const detail = await this.transport.createThread(title)
    if (!detail) {
      this.appendDebugLog('session:create:failed')
      return
    }
    await this.refreshSessions()
    await this.applyThreadDetail(detail, true)
  }

  private async openThread(threadId: string): Promise<void> {
    this.appendDebugLog(`session:open:${threadId}`)
    const detail = await this.transport.resumeThread(threadId) ?? await this.transport.readThread(threadId)
    if (!detail) {
      this.appendDebugLog(`session:missing:${threadId}`)
      return
    }
    this.appendDebugLog(`session:open:ok:${threadId}:${trimPreview(detail.title, 32)}`)
    await this.applyThreadDetail(detail, true)
  }

  private async backToSessions(): Promise<void> {
    if (this.voiceSession.isRecording()) {
      await this.stopVoiceRecording()
    }
    this.pendingTurnMode = null
    this.unsubscribeFromThreadEvents()
    this.state.currentThreadId = null
    this.state.currentTitle = ''
    this.state.messages = []
    this.state.draftSegments = []
    this.state.draftInput = ''
    this.state.runtime = null
    this.state.sendFailed = false
    this.state.mode = 'sessions'
    this.render()
    await this.renderGlass()
  }

  private async applyThreadDetail(detail: SessionDetail, subscribe = false): Promise<void> {
    this.appendDebugLog(`session:hydrate:${detail.threadId}:messages=${detail.messages.length}`)
    this.state.currentThreadId = detail.threadId
    this.state.currentTitle = detail.title
    this.state.messages = detail.messages.slice()
    this.state.draftSegments = loadThreadDraft(detail.threadId)
    this.state.sendFailed = false
    this.state.mode = 'reply'
    this.state.runtime = await this.loadRuntime(detail.threadId)
    if (this.state.runtime?.running) {
      this.state.mode = 'implement'
    }
    if (subscribe) {
      this.subscribeToThread(detail.threadId)
    }
    this.render()
    await this.renderGlass()
  }

  private async loadRuntime(threadId: string): Promise<RuntimeSnapshot> {
    try {
      return await this.transport.getRuntime(threadId)
    } catch {
      return createEmptyRuntime(threadId)
    }
  }

  private subscribeToThread(threadId: string): void {
    this.unsubscribeFromThreadEvents()
    this.appendDebugLog(`thread:subscribe:${threadId}`)
    this.unsubscribeThreadEvents = this.transport.subscribeToThreadEvents(threadId, (event) => {
      void this.handleThreadEvent(event)
    })
  }

  private unsubscribeFromThreadEvents(): void {
    this.clearPendingResponseWatchdog()
    if (!this.unsubscribeThreadEvents) {
      return
    }
    this.unsubscribeThreadEvents()
    this.unsubscribeThreadEvents = null
  }

  private async handleThreadEvent(event: ThreadEvent): Promise<void> {
    if (this.state.currentThreadId && event.threadId && event.threadId !== this.state.currentThreadId) {
      return
    }

    if (event.type === 'message-delta') {
      this.appendDebugLog(`thread:event:${event.type}:${event.itemId}:${event.text.length}`)
    } else if (event.type === 'message-completed') {
      this.appendDebugLog(`thread:event:${event.type}:${event.role}:${event.itemId}`)
    } else if (event.type === 'turn-completed') {
      this.appendDebugLog(`thread:event:${event.type}:${event.status}`)
    } else if (event.type === 'turn-started') {
      this.appendDebugLog(`thread:event:${event.type}:${event.turnId}`)
    } else if (event.type === 'runtime-event') {
      this.appendDebugLog(`thread:event:${event.type}:${trimPreview(event.text, 48)}`)
    } else if (event.type === 'thread-status') {
      this.appendDebugLog(`thread:event:${event.type}:${event.status}`)
    } else if (event.type === 'error') {
      this.appendDebugLog(`thread:event:${event.type}:${event.message}`)
    }

    if (event.type === 'turn-started') {
      this.state.sendFailed = false
      if (this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, running: true, turnId: event.turnId, status: 'running', error: null }
      }
      if (this.pendingTurnMode === 'implement') {
        this.state.mode = 'implement'
      }
      this.render()
      await this.renderGlass()
      return
    }

    if (event.type === 'message-delta') {
      this.state.sendFailed = false
      this.clearPendingResponseWatchdog()
      this.upsertMessage({
        id: event.itemId,
        role: event.role,
        text: event.text,
        turnId: event.turnId,
        isStreaming: true,
      })
      if (this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, lastAgentText: event.text }
      }
      this.render()
      await this.renderGlass()
      return
    }

    if (event.type === 'message-completed') {
      this.state.sendFailed = false
      if (event.role === 'assistant') {
        this.clearPendingResponseWatchdog()
      }
      this.upsertMessage({
        id: event.itemId,
        role: event.role,
        text: event.text,
        turnId: event.turnId,
        isStreaming: false,
      })
      if (event.role === 'assistant' && this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, lastAgentText: event.text }
      }
      this.render()
      await this.renderGlass()
      return
    }

    if (event.type === 'runtime-event') {
      if (event.text === 'connected') {
        return
      }
      if (event.text === 'event-stream-open') {
        this.appendDebugLog('thread:event-stream:open')
        return
      }
      if (event.text === 'event-stream-error') {
        this.appendDebugLog('thread:event-stream:error')
        return
      }
      const snapshot = this.tryParseRuntimeSnapshot(event.text)
      if (snapshot && this.state.currentThreadId === snapshot.threadId) {
        this.state.runtime = snapshot
        this.render()
        return
      }
      if (this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, events: [...this.state.runtime.events, event.text].slice(-10) }
      }
      this.render()
      return
    }

    if (event.type === 'thread-status') {
      this.state.sessions = this.state.sessions.map((session) => session.id === event.threadId
        ? { ...session, status: event.status }
        : session)
      this.render()
      return
    }

    if (event.type === 'turn-completed') {
      this.state.sendFailed = false
      this.clearPendingResponseWatchdog()
      if (this.state.runtime) {
        this.state.runtime = {
          ...this.state.runtime,
          running: false,
          turnId: null,
          status: event.status,
          error: event.error,
        }
      }
      const completedMode = this.pendingTurnMode
      this.pendingTurnMode = null
      await this.refreshSessions()
      if (completedMode === 'implement') {
        this.state.mode = 'reply'
      }
      if (this.state.currentThreadId) {
        const detail = await this.transport.readThread(this.state.currentThreadId)
        if (detail) {
          this.state.messages = detail.messages.slice()
        }
      }
      this.render()
      await this.renderGlass()
      return
    }

    if (event.type === 'error') {
      this.clearPendingResponseWatchdog()
      this.state.sendFailed = false
      if (this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, running: false, status: 'error', error: event.message }
      }
      this.pendingTurnMode = null
      this.appendDebugLog(`thread:error:${event.message}`)
      this.render()
      await this.renderGlass()
    }
  }

  private tryParseRuntimeSnapshot(raw: string): RuntimeSnapshot | null {
    if (!raw.startsWith('{')) {
      return null
    }
    try {
      const parsed = JSON.parse(raw) as RuntimeSnapshot
      return parsed && typeof parsed.threadId === 'string' ? parsed : null
    } catch {
      return null
    }
  }

  private upsertMessage(next: ConversationEntry): void {
    const existingIndex = this.state.messages.findIndex((message) => message.id === next.id)
    if (existingIndex >= 0) {
      this.state.messages.splice(existingIndex, 1, next)
      return
    }
    this.state.messages = [...this.state.messages, next]
  }

  private getPendingDraftText(): string {
    return [...this.state.draftSegments, this.state.draftInput.trim()].filter(Boolean).join('\n').trim()
  }

  private addDraftSegment(text: string): void {
    const normalized = text.trim()
    if (!normalized || !this.state.currentThreadId) {
      return
    }
    this.state.draftSegments = [...this.state.draftSegments, normalized]
    saveThreadDraft(this.state.currentThreadId, this.state.draftSegments)
  }

  private async sendDraft(mode: TurnMode): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    const threadId = this.state.currentThreadId
    const text = this.getPendingDraftText()
    if (!text) {
      return
    }
    const segments = [...this.state.draftSegments]
    const draftInput = this.state.draftInput
    this.pendingTurnMode = mode
    this.state.sendFailed = false
    this.state.draftSegments = []
    this.state.draftInput = ''
    clearThreadDraft(threadId)
    this.state.runtime = {
      ...(this.state.runtime ?? createEmptyRuntime(threadId)),
      running: true,
      status: 'running',
      error: null,
    }
    this.state.mode = mode === 'implement' ? 'implement' : 'reply'
    this.render()
    await this.renderGlass()

    try {
      const started = await this.transport.startTurn(threadId, text, mode)
      if (this.state.runtime) {
        this.state.runtime = {
          ...this.state.runtime,
          running: true,
          turnId: started.started.turnId,
          status: 'running',
          error: null,
          events: [...this.state.runtime.events, 'Waiting for agent response...'].slice(-10),
        }
      }
      this.appendDebugLog(`turn:start:${mode}:${started.started.turnId}`)
      this.schedulePendingResponseWatchdog(threadId, started.started.turnId)
      this.render()
      await this.renderGlass()
    } catch (error) {
      this.clearPendingResponseWatchdog()
      this.pendingTurnMode = null
      this.state.sendFailed = true
      this.state.draftSegments = segments
      this.state.draftInput = draftInput
      saveThreadDraft(threadId, this.state.draftSegments)
      if (this.state.runtime) {
        this.state.runtime = {
          ...this.state.runtime,
          running: false,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }
      }
      this.appendDebugLog(`turn:start:failed:${error instanceof Error ? error.message : String(error)}`)
      this.render()
      await this.renderGlass()
    }
  }

  private schedulePendingResponseWatchdog(threadId: string, turnId: string): void {
    this.clearPendingResponseWatchdog()
    this.pendingResponseWatchdogHandle = window.setTimeout(() => {
      if (!this.state.runtime || this.state.currentThreadId !== threadId) {
        return
      }
      if (!this.state.runtime.running || this.state.runtime.turnId !== turnId || this.state.runtime.lastAgentText.trim()) {
        return
      }
      this.appendDebugLog(`turn:waiting:no-response:${turnId}`)
      this.state.runtime = {
        ...this.state.runtime,
        events: [...this.state.runtime.events, 'Still waiting for agent response...'].slice(-10),
      }
      this.render()
    }, 5_000)
  }

  private clearPendingResponseWatchdog(): void {
    if (this.pendingResponseWatchdogHandle === null) {
      return
    }
    window.clearTimeout(this.pendingResponseWatchdogHandle)
    this.pendingResponseWatchdogHandle = null
  }

  private async interruptTurn(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    try {
      await this.transport.interruptTurn(this.state.currentThreadId)
      this.appendDebugLog('turn:interrupt')
    } catch (error) {
      this.appendDebugLog(`turn:interrupt:failed:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async toggleVoiceRecording(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    if (this.voiceSession.isRecording()) {
      await this.stopVoiceRecording()
      return
    }
    this.voiceSession.start()
    this.state.voiceState = 'listening'
    this.state.voiceChunkCount = 0
    this.appendDebugLog('voice:start')
    if (this.bridge) {
      await this.bridge.audioControl(true)
    }
    this.render()
    await this.renderGlass()
  }

  private async stopVoiceRecording(): Promise<void> {
    this.state.voiceState = 'transcribing'
    this.render()
    await this.renderGlass()
    if (this.bridge) {
      await this.bridge.audioControl(false)
    }
    const transcript = await this.voiceSession.stop()
    this.state.voiceState = 'ready'
    this.state.voiceChunkCount = 0
    if (transcript.trim()) {
      this.state.draftInput = this.state.draftInput.trim()
        ? `${this.state.draftInput.trim()}\n${transcript}`
        : transcript
      this.appendDebugLog(`voice:transcript:${trimPreview(transcript, 48)}`)
    } else {
      this.appendDebugLog('voice:transcript:empty')
    }
    this.render()
    await this.renderGlass()
  }

  private describeBridgeEvent(event: EvenHubEvent): string {
    if (event.listEvent) {
      const selection = typeof event.listEvent.currentSelectItemIndex === 'number'
        ? String(event.listEvent.currentSelectItemIndex)
        : (event.listEvent.currentSelectItemName ?? '-')
      return `bridge:event:list:${event.listEvent.containerName ?? '-'}:${selection}`
    }
    if (event.textEvent) {
      return `bridge:event:text:${event.textEvent.containerName ?? '-'}`
    }
    if (event.audioEvent) {
      return `bridge:event:audio:${event.audioEvent.audioPcm.length}`
    }
    if (event.sysEvent) {
      return `bridge:event:sys:${String(event.sysEvent.eventType ?? '-')}`
    }
    return 'bridge:event:unknown'
  }

  private handleBridgeEvent(event: EvenHubEvent): void {
    let eventType = normalizeEventType(getRawEventType(event), HUB_EVENT_TYPES)

    if (event.listEvent?.containerName === GLASS_SESSIONS_LIST_NAME) {
      if (eventType === undefined) {
        // Simulator clicks on the first row can omit both eventType and selection.
        eventType = HUB_EVENT_TYPES.CLICK_EVENT
      }
      this.appendDebugLog([
        'glass:sessions:event',
        `type=${String(eventType)}`,
        `index=${String(event.listEvent.currentSelectItemIndex ?? '-')}`,
        `name=${String(event.listEvent.currentSelectItemName ?? '-')}`,
        `sessions=${this.state.sessions.length}`,
      ].join(':'))
      const entry = this.resolveGlassSessionEntry(event)
      this.appendDebugLog(`glass:sessions:resolved:${entry?.kind ?? 'none'}:${entry?.label ?? '-'}`)
      if (entry && eventType !== HUB_EVENT_TYPES.SCROLL_TOP_EVENT && eventType !== HUB_EVENT_TYPES.SCROLL_BOTTOM_EVENT) {
        if (entry.kind === 'create') {
          void this.createSession()
        } else {
          void this.openThread(entry.session.id)
        }
      }
      return
    }

    if (event.textEvent?.containerName === GLASS_MESSAGE_CONTAINER_NAME) {
      if (eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
        void this.backToSessions()
        return
      }
      if (eventType === HUB_EVENT_TYPES.CLICK_EVENT || eventType === undefined) {
        void this.toggleVoiceRecording()
        return
      }
    }

    const audioPcm = event.audioEvent?.audioPcm
    if (!audioPcm || !this.voiceSession.isRecording()) {
      return
    }
    this.voiceSession.pushChunk(audioPcm)
    this.state.voiceChunkCount = this.voiceSession.getStats().chunkCount
    this.render()
    void this.renderGlass()
  }

  private resolveGlassSessionEntry(event: EvenHubEvent): GlassSessionEntry | null {
    const visibleEntries = this.getGlassSessionEntries()
    const incomingIndex = typeof event.listEvent?.currentSelectItemIndex === 'number'
      ? event.listEvent.currentSelectItemIndex
      : -1
    if (incomingIndex >= 0 && incomingIndex < visibleEntries.length) {
      this.appendDebugLog(`glass:sessions:resolve-by-index:${incomingIndex}`)
      return visibleEntries[incomingIndex] ?? null
    }
    const incomingName = event.listEvent?.currentSelectItemName?.trim().toLowerCase()
    if (!incomingName) {
      this.appendDebugLog('glass:sessions:resolve-fallback-first')
      return visibleEntries[0] ?? null
    }
    const resolved = visibleEntries.find((entry) => {
      const label = entry.label.trim().toLowerCase()
      return label === incomingName || incomingName.startsWith(label)
    }) ?? visibleEntries[0] ?? null
    this.appendDebugLog(`glass:sessions:resolve-by-name:${incomingName}:${resolved?.kind ?? 'none'}`)
    return resolved
  }

  private getLatestMessage(): ConversationEntry | null {
    return this.state.messages.length > 0 ? this.state.messages[this.state.messages.length - 1] ?? null : null
  }

  private getLatestAssistantMessage(): ConversationEntry | null {
    for (let index = this.state.messages.length - 1; index >= 0; index -= 1) {
      const message = this.state.messages[index]
      if (message?.role === 'assistant') {
        return message
      }
    }
    return null
  }

  private getLatestMessageText(): string {
    return this.getLatestMessage()?.text ?? getTranslations(this.state.language).sessions.noMessagesYet
  }

  private getPrimaryGlassMessageText(): string {
    const assistantText = this.getLatestAssistantMessage()?.text
    if (assistantText) {
      return formatAssistantMessageForGlasses(assistantText)
    }

    return this.getLatestAssistantMessage()?.text
      ?? this.getLatestMessage()?.text
      ?? getTranslations(this.state.language).sessions.noMessagesYet
  }

  private getGlassSessionLabel(session: SessionSummary, index: number): string {
    return `${index + 1}. ${trimPreview(session.title, 24)}`
  }

  private getGlassSessionEntries(): GlassSessionEntry[] {
    const t = getTranslations(this.state.language)
    const sessionLimit = Math.max(0, GLASS_SESSION_LIMIT - 1)
    const sessionEntries = this.state.sessions
      .slice(0, sessionLimit)
      .map((session, index) => ({
        kind: 'session' as const,
        label: this.getGlassSessionLabel(session, index),
        session,
      }))

    return [
      ...sessionEntries,
      { kind: 'create', label: t.glasses.createNewSession },
    ]
  }

  private getGlassStatusLabel(): string {
    const t = getTranslations(this.state.language)
    if (this.state.voiceState === 'listening') {
      return t.glasses.status.listening
    }
    if (this.state.voiceState === 'transcribing') {
      return t.glasses.status.transcribing
    }
    if (this.state.sendFailed) {
      return t.glasses.status.error
    }
    if (this.state.runtime?.error) {
      return t.glasses.status.error
    }
    if (this.state.runtime?.status === 'interrupted') {
      return t.glasses.status.stopped
    }
    if (this.state.runtime?.running) {
      return t.glasses.status.running
    }
    if (this.getPendingDraftText()) {
      return t.glasses.status.draft
    }
    return t.glasses.status.waiting
  }

  private buildGlassHeaderLine(title: string, status: string): string {
    const safeTitle = trimPreview(title.replace(/\s+/g, ' ').trim(), GLASS_HEADER_WIDTH - GLASS_STATUS_WIDTH - 1)
    const sessionWidth = Math.max(1, GLASS_HEADER_WIDTH - GLASS_STATUS_WIDTH - 1)
    const sessionLabel = safeTitle.padEnd(sessionWidth, ' ')
    const statusLabel = status.trim().slice(0, GLASS_STATUS_WIDTH).padStart(GLASS_STATUS_WIDTH, ' ')
    return `${sessionLabel} ${statusLabel}`
  }

  private getSafeGlassBodyText(): string {
    const t = getTranslations(this.state.language)
    if (!this.state.currentThreadId) {
      const labels = this.getGlassSessionEntries().map((entry) => entry.label)
      const header = this.buildGlassHeaderLine(t.glasses.sessionsTitle, t.glasses.status.selecting)
      const text = `${header}\n${labels.join('\n')}`
      return wrapGlassText(text, GLASS_WRAP_WIDTH).slice(0, GLASS_VISIBLE_LINES).join('\n')
    }

    const header = this.buildGlassHeaderLine(this.state.currentTitle || 'Session', this.getGlassStatusLabel())
    const messageText = trimMultilinePreview(this.getPrimaryGlassMessageText(), 800)
    return `${header}\n${messageText}`
  }

  private buildStartupGlassPage(): CreateStartUpPageContainer {
    return new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [new TextContainerProperty({
        containerID: GLASS_MESSAGE_CONTAINER_ID,
        containerName: GLASS_MESSAGE_CONTAINER_NAME,
        content: 'Hello World',
        xPosition: 8,
        yPosition: 96,
        width: 560,
        height: 48,
        isEventCapture: 1,
      })],
    })
  }

  private buildMessageGlassPage(content: string): CreateStartUpPageContainer {
    return new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [new TextContainerProperty({
        containerID: GLASS_MESSAGE_CONTAINER_ID,
        containerName: GLASS_MESSAGE_CONTAINER_NAME,
        content,
        xPosition: 8,
        yPosition: 68,
        width: 560,
        height: 198,
        isEventCapture: 1,
      })],
    })
  }

  private buildSessionListGlassPage(): CreateStartUpPageContainer {
    const t = getTranslations(this.state.language)
    const labels = this.getGlassSessionEntries().map((entry) => entry.label)
    const header = this.buildGlassHeaderLine(t.glasses.sessionsTitle, t.glasses.status.selecting)
    return new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [new TextContainerProperty({
        containerID: GLASS_SESSIONS_TITLE_ID,
        containerName: GLASS_SESSIONS_TITLE_NAME,
        content: header,
        xPosition: 8,
        yPosition: 4,
        width: 560,
        height: 28,
        isEventCapture: 0,
      })],
      listObject: [new ListContainerProperty({
        containerID: GLASS_SESSIONS_LIST_ID,
        containerName: GLASS_SESSIONS_LIST_NAME,
        itemContainer: new ListItemContainerProperty({
          itemCount: labels.length,
          itemWidth: 560,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
        isEventCapture: 1,
        xPosition: 8,
        yPosition: 40,
        width: 560,
        height: 222,
      })],
      currentSelectedItem: 0,
    })
  }

  private getDesiredGlassPage(): { view: 'sessions' | 'message'; page: CreateStartUpPageContainer; text: string } {
    if (!this.state.currentThreadId) {
      return {
        view: 'sessions',
        page: this.buildSessionListGlassPage(),
        text: '',
      }
    }

    const nextText = this.getSafeGlassBodyText()
    return {
      view: 'message',
      page: this.buildMessageGlassPage(nextText),
      text: nextText,
    }
  }

  private async tryRecoverExistingGlassPage(): Promise<boolean> {
    if (!this.bridge) {
      return false
    }

    const desired = this.getDesiredGlassPage()
    const rebuildResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(desired.page.toJson()))
    if (rebuildResult === 0 || rebuildResult === true) {
      this.startupRendered = true
      this.currentGlassView = desired.view
      this.lastRenderedGlassText = desired.text
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog(`glass:startup-recover:ok:${desired.view}`)
      this.render()
      return true
    }

    this.appendDebugLog(`glass:startup-recover:fail:${String(rebuildResult)}`)
    return false
  }

  private async renderGlass(): Promise<void> {
    if (!this.state.glassesEnabled || !this.bridge) {
      this.state.glassStatus = 'Bridge unavailable'
      this.render()
      return
    }

    if (!this.startupRendered) {
      this.appendDebugLog('glass:create:startup')
      const startupResult = await this.bridge.createStartUpPageContainer(this.buildStartupGlassPage())
      if (startupResult === 0 || startupResult === true) {
        this.startupRendered = true
        this.currentGlassView = 'startup'
        this.lastRenderedGlassText = 'Hello World'
        this.state.glassStatus = 'Rendered on glasses'
        this.appendDebugLog('glass:create:ok')
        this.render()
        await this.delay(POST_STARTUP_REBUILD_DELAY_MS)
        await this.renderGlass()
        return
      }
      if (startupResult === 1) {
        this.appendDebugLog('glass:create:invalid-recover')
        const recovered = await this.tryRecoverExistingGlassPage()
        if (recovered) {
          return
        }
      }
      this.state.glassStatus = `First render failed (code: ${String(startupResult)})`
      this.appendDebugLog(`glass:create:fail:${String(startupResult)}`)
      this.render()
      return
    }

    if (!this.state.currentThreadId) {
      const sessionResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(this.buildSessionListGlassPage().toJson()))
      if (sessionResult === 0 || sessionResult === true) {
        this.currentGlassView = 'sessions'
        this.lastRenderedGlassText = ''
        this.state.glassStatus = 'Updated on glasses'
        this.appendDebugLog('glass:sessions-view:ok')
      } else {
        this.state.glassStatus = `Update failed (code: ${String(sessionResult)})`
        this.appendDebugLog(`glass:sessions-view:fail:${String(sessionResult)}`)
      }
      this.render()
      return
    }

    const nextText = this.getSafeGlassBodyText()
    const page = this.buildMessageGlassPage(nextText)
    if (this.currentGlassView !== 'message') {
      const rebuildResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(page.toJson()))
      if (rebuildResult === 0 || rebuildResult === true) {
        this.currentGlassView = 'message'
        this.lastRenderedGlassText = nextText
        this.state.glassStatus = 'Updated on glasses'
        this.appendDebugLog('glass:layout-expand:ok')
      } else {
        this.state.glassStatus = `Update failed (code: ${String(rebuildResult)})`
        this.appendDebugLog(`glass:layout-expand:fail:${String(rebuildResult)}`)
      }
      this.render()
      return
    }

    if (nextText === this.lastRenderedGlassText) {
      this.state.glassStatus = 'Updated on glasses'
      this.render()
      return
    }

    const contentLength = Math.max(1, this.lastRenderedGlassText.length, nextText.length)
    const upgradeResult = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: GLASS_MESSAGE_CONTAINER_ID,
      containerName: GLASS_MESSAGE_CONTAINER_NAME,
      contentOffset: 0,
      contentLength,
      content: nextText,
    }))
    if (upgradeResult === 0 || upgradeResult === true) {
      this.lastRenderedGlassText = nextText
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog(`glass:text-upgrade:ok:${contentLength}`)
      this.render()
      return
    }

    const fallbackResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(page.toJson()))
    if (fallbackResult === 0 || fallbackResult === true) {
      this.lastRenderedGlassText = nextText
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog('glass:rebuild-fallback:ok')
    } else {
      this.state.glassStatus = `Update failed (code: ${String(fallbackResult)})`
      this.appendDebugLog(`glass:rebuild-fallback:fail:${String(fallbackResult)}`)
    }
    this.render()
  }

  private render(): void {
    const t = getTranslations(this.state.language)
    this.byId<HTMLInputElement>('gateway-input').value = this.state.gatewayInput
    this.byId<HTMLInputElement>('gateway-token-input').value = this.state.gatewayTokenInput
    this.byId<HTMLSelectElement>('language-select').value = this.state.language
    const gatewayStatus = this.state.gatewayUrl
      ? t.gateway.remoteStatus(this.state.gatewayUrl, Boolean(this.state.gatewayToken))
      : t.gateway.embeddedStatus
    this.byId<HTMLParagraphElement>('gateway-status').innerHTML = `<strong>${this.escapeHtml(t.gateway.statusLabel)}:</strong> ${this.escapeHtml(gatewayStatus)}`
    this.byId<HTMLSpanElement>('bridge-status-text').textContent = this.state.bridgeLabel
    this.byId<HTMLSpanElement>('bridge-status-inline').textContent = `${t.runtime.bridge}: ${this.state.bridgeLabel}`
    this.byId<HTMLSpanElement>('voice-state').textContent = this.describeVoiceState()

    const currentLabel = this.state.currentThreadId ? this.state.currentTitle || this.state.currentThreadId : t.sessions.noActiveSession
    const subtitle = this.state.currentThreadId
      ? trimPreview(this.getLatestMessageText(), 96)
      : t.sessions.openToRead
    this.byId<HTMLDivElement>('topbar-session-title').textContent = currentLabel
    this.byId<HTMLDivElement>('topbar-session-subtitle').textContent = subtitle
    this.byId<HTMLAsideElement>('session-rail').classList.toggle('is-open', this.state.sessionsSheetOpen)
    this.byId<HTMLAsideElement>('settings-sheet').classList.toggle('is-open', this.state.settingsOpen)
    this.byId<HTMLDivElement>('sheet-backdrop').classList.toggle('is-open', this.state.settingsOpen || this.state.sessionsSheetOpen)

    const runtimeStatus = this.state.runtime
      ? [`${t.runtime.status}: ${this.state.runtime.status}`, this.state.runtime.running ? t.runtime.turnActive : t.runtime.idle, this.state.runtime.error ? `${t.runtime.error}: ${this.state.runtime.error}` : ''].filter(Boolean).join(' · ')
      : t.runtime.noTurn
    this.byId<HTMLParagraphElement>('runtime-status').textContent = `${runtimeStatus} · ${t.runtime.glass}: ${this.state.glassStatus}`

    const sessionList = this.byId<HTMLUListElement>('session-list')
    sessionList.innerHTML = this.state.sessions.length > 0
      ? this.state.sessions.map((session) => `
          <li class="session-row${session.id === this.state.currentThreadId ? ' is-active' : ''}" data-thread-id="${session.id}">
            <div class="session-row-title">${this.escapeHtml(session.title)}</div>
            <div class="session-row-preview">${this.escapeHtml(trimPreview(session.preview || t.sessions.noPreviewYet, 72))}</div>
          </li>
        `).join('')
      : `<li class="session-row is-empty">${this.escapeHtml(t.sessions.noSessions)}</li>`

    const history = this.byId<HTMLUListElement>('conversation-history')
    history.innerHTML = this.state.messages.length > 0
      ? this.state.messages.map((message) => `
          <li class="chat-item is-${message.role}">
            <div class="chat-role">${this.escapeHtml(message.role === 'assistant' ? t.conversation.assistant : t.conversation.user)}${message.isStreaming ? `*` : ''}</div>
            <div class="chat-body">${this.escapeHtml(message.text)}</div>
          </li>
        `).join('')
      : `<li class="chat-item">${this.escapeHtml(t.conversation.empty)}</li>`

    const runtimeEvents = this.byId<HTMLUListElement>('runtime-events')
    const runtimeLines = [...(this.state.runtime?.events ?? []), ...(this.state.runtime?.lastAgentText ? [trimPreview(this.state.runtime.lastAgentText, 160)] : [])]
    runtimeEvents.innerHTML = runtimeLines.length > 0
      ? runtimeLines.slice(-8).map((line) => `<li class="event-item">${this.escapeHtml(line)}</li>`).join('')
      : `<li class="event-item">${this.escapeHtml(t.runtime.noEvents)}</li>`

    const debugLog = this.root.querySelector<HTMLTextAreaElement>('#debug-log')
    if (debugLog) {
      const visibleDebugLog = this.state.debugLogExpanded
        ? this.state.debugLog
        : this.state.debugLog.slice(-20)
      debugLog.value = visibleDebugLog.length > 0
        ? visibleDebugLog.join('\n')
        : t.debug.empty
      debugLog.classList.toggle('is-active', this.state.debugLogExpanded)
    }

    this.byId<HTMLTextAreaElement>('draft-input').value = this.state.draftInput
    this.byId<HTMLButtonElement>('sync-glasses-btn').disabled = !this.bridge
    this.byId<HTMLButtonElement>('voice-toggle-btn').disabled = !this.state.currentThreadId
    const pendingDraftText = this.getPendingDraftText()
    this.byId<HTMLButtonElement>('send-reply-btn').disabled = !this.state.currentThreadId || !pendingDraftText
    this.byId<HTMLButtonElement>('interrupt-turn-btn').disabled = !this.state.runtime?.running
    this.byId<HTMLButtonElement>('interrupt-turn-btn').hidden = !this.state.runtime?.running
    this.byId<HTMLButtonElement>('voice-toggle-btn').textContent = this.voiceSession.isRecording() ? t.controls.stopRecording : t.controls.holdToTalk
  }

  private describeVoiceState(): string {
    const t = getTranslations(this.state.language)
    if (this.state.voiceState === 'listening') {
      return t.voice.listening(this.state.voiceChunkCount)
    }
    if (this.state.voiceState === 'transcribing') {
      return t.voice.transcribing
    }
    return t.voice.ready
  }

  private appendDebugLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
    const entry = `${timestamp} [${this.instanceId}] ${message}`
    this.state.debugLog = [...this.state.debugLog, entry].slice(-200)
    void this.transport.appendDebugLog(entry).catch(() => {})
    console.log(`[agent_terminal] ${message}`)
  }

  private byId<T extends HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`)
    if (!element) {
      throw new Error(`Missing element #${id}`)
    }
    return element
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }
}
