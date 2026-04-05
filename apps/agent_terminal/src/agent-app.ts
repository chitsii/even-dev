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
import { getEventSelectionIndex, getRawEventType, normalizeEventType } from '../../_shared/even-events'
import {
  getRemoteGatewayToken,
  getRemoteGatewayUrl,
  saveRemoteGatewayToken,
  saveRemoteGatewayUrl,
} from './runtime-config'
import { clearThreadDraft, loadThreadDraft, saveThreadDraft } from './draft-storage'
import { appendDraftSegment, composeDraftText, dropLastDraftSegment } from './draft-composer'
import {
  detectInitialLanguage,
  getTranslations,
  saveLanguage,
  type LanguageCode,
} from './i18n'
import {
  createAgentTerminalTransport,
  type BackendStatus,
  type ConversationEntry,
  type RuntimeSnapshot,
  type SessionDetail,
  type SessionSummary,
  type ThreadEvent,
  TransportRequestError,
} from './transport'
import { createVoiceSession } from './voice'
import { wrapGlassText } from './wrap-glass-text'

export type AppMode = 'sessions' | 'reply' | 'implement'
export type VoiceState = 'ready' | 'listening' | 'transcribing'
type TurnMode = 'reply' | 'implement'
export type SettingsTab = 'general' | 'gateway' | 'runtime'
export type GlassRoute = 'standby' | 'sessions' | 'detail' | 'draftReview'
type HubEventTypeMap = { CLICK_EVENT: number; SCROLL_TOP_EVENT: number; SCROLL_BOTTOM_EVENT: number; DOUBLE_CLICK_EVENT: number }
type GlassSessionEntry =
  | { kind: 'session'; label: string; session: SessionSummary }
  | { kind: 'create'; label: string }
type GlassDraftReviewEntry =
  | { kind: 'send'; label: string }
  | { kind: 'continue'; label: string }
  | { kind: 'rerecord'; label: string }
  | { kind: 'cancel'; label: string }
export type AppState = {
  mode: AppMode
  glassRoute: GlassRoute
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
  gatewayProbeStatus: 'idle' | 'checking' | 'success' | 'error'
  gatewayProbeMessage: string
  language: LanguageCode
  autoGlassOffSeconds: number
  sendFailed: boolean
  glassesEnabled: boolean
  glassAutoPaused: boolean
  glassStatus: string
  debugLog: string[]
  debugLogExpanded: boolean
  settingsOpen: boolean
  settingsTab: SettingsTab
  sessionsSheetOpen: boolean
  backendStatus: BackendStatus | null
}

const GLASS_WRAP_WIDTH = 38
const GLASS_VISIBLE_LINES = 8
const GLASS_HEADER_WIDTH = 30
const GLASS_STATUS_WIDTH = 5
const GLASS_DETAIL_PAGE_LINES = 11
const GLASS_AGENT_PAGE_LINES = 13
const GLASS_REVIEW_PAGE_LINES = 7
const SESSION_LIMIT = 20
const GLASS_SESSION_LIMIT = 5
const RUNTIME_POLL_INTERVAL_MS = 1500
const SESSION_POLL_INTERVAL_MS = 2000
const POST_STARTUP_REBUILD_DELAY_MS = 1500
const GLASS_DOUBLE_TAP_WINDOW_MS = 500
const GLASS_AUTO_SCROLL_INTERVAL_MS = 3500
const GLASS_AUTO_SCROLL_PAUSE_AFTER_MANUAL_MS = 8000
const GLASSES_ENABLED_STORAGE_KEY = 'even.agent_terminal.glasses_enabled.v1'
const AUTO_GLASS_OFF_SECONDS_STORAGE_KEY = 'even.agent_terminal.auto_glass_off_seconds.v1'
const GLASS_MESSAGE_HEADER_ID = 1
const GLASS_MESSAGE_HEADER_NAME = 'agt-hdr'
const GLASS_MESSAGE_CONTAINER_ID = 2
const GLASS_MESSAGE_CONTAINER_NAME = 'agt-body'
const GLASS_SESSIONS_TITLE_ID = 11
const GLASS_SESSIONS_TITLE_NAME = 'sess-title'
const GLASS_SESSIONS_LIST_ID = 12
const GLASS_SESSIONS_LIST_NAME = 'sess-list'
const GLASS_REVIEW_TITLE_ID = 31
const GLASS_REVIEW_TITLE_NAME = 'review-title'
const GLASS_REVIEW_BODY_ID = 32
const GLASS_REVIEW_BODY_NAME = 'review-body'
const GLASS_REVIEW_LIST_ID = 33
const GLASS_REVIEW_LIST_NAME = 'review-list'
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

function loadAutoGlassOffSeconds(): number {
  try {
    const raw = window.localStorage.getItem(AUTO_GLASS_OFF_SECONDS_STORAGE_KEY)
    const parsed = Number.parseInt(raw ?? '0', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

function saveAutoGlassOffSeconds(seconds: number): number {
  const next = Number.isFinite(seconds) && seconds > 0 ? Math.max(0, Math.floor(seconds)) : 0
  try {
    if (next > 0) {
      window.localStorage.setItem(AUTO_GLASS_OFF_SECONDS_STORAGE_KEY, String(next))
    } else {
      window.localStorage.removeItem(AUTO_GLASS_OFF_SECONDS_STORAGE_KEY)
    }
  } catch {
    // Ignore localStorage failures.
  }
  return next
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
  private readonly instanceId = Math.random().toString(36).slice(2, 8)
  private readonly listeners = new Set<() => void>()
  private readonly transport = createAgentTerminalTransport({
    getBasePath: () => this.state.gatewayUrl || '/__agent_terminal_api',
    getGatewayToken: () => this.state.gatewayToken,
  })
  private readonly voiceSession = createVoiceSession()
  private readonly state: AppState = {
    mode: 'sessions',
    glassRoute: 'standby',
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
    gatewayProbeStatus: 'idle',
    gatewayProbeMessage: '',
    language: detectInitialLanguage(),
    autoGlassOffSeconds: loadAutoGlassOffSeconds(),
    sendFailed: false,
    glassesEnabled: loadGlassesEnabled(),
    glassAutoPaused: false,
    glassStatus: 'Waiting for bridge',
    debugLog: [],
    debugLogExpanded: false,
    settingsOpen: false,
    settingsTab: 'general',
    sessionsSheetOpen: false,
    backendStatus: null,
  }
  private snapshot: Readonly<AppState> = this.createSnapshot()

  private bridge: EvenAppBridge | null = null
  private startupRendered = false
  private currentGlassView: 'startup' | GlassRoute = 'startup'
  private lastRenderedGlassHeader = ''
  private lastRenderedGlassText = ''
  private glassAutoScrollHandle: number | null = null
  private glassAutoScrollPauseUntil = 0
  private glassSessionsSelectedIndex = 0
  private glassDraftReviewSelectedIndex = 0
  private glassDetailPage = 0
  private currentSttSessionId: string | null = null
  private sttUploadChain: Promise<void> = Promise.resolve()
  private sttUploadFailed: Error | null = null
  private runtimePollHandle: number | null = null
  private sessionPollHandle: number | null = null
  private unsubscribeThreadEvents: (() => void) | null = null
  private pendingTurnMode: TurnMode | null = null
  private pendingResponseWatchdogHandle: number | null = null
  private autoGlassOffHandle: number | null = null
  private lastStandbyTapAt = 0

  constructor() {}

  async init(): Promise<void> {
    this.state.gatewayUrl = getRemoteGatewayUrl()
    this.state.gatewayInput = this.state.gatewayUrl
    this.state.gatewayToken = getRemoteGatewayToken()
    this.state.gatewayTokenInput = this.state.gatewayToken
    this.appendDebugLog('init:start')
    this.render()
    await this.connectBridge()
    await this.refreshBackendStatus()
    await this.refreshSessions()
    this.startRuntimePolling()
    this.startSessionPolling()
    if (this.bridge) {
      this.state.glassesEnabled = true
      saveGlassesEnabled(true)
      await this.renderGlass()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): Readonly<AppState> {
    return this.snapshot
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

  async saveGateway(): Promise<void> {
    this.state.gatewayUrl = saveRemoteGatewayUrl(this.state.gatewayInput)
    this.state.gatewayInput = this.state.gatewayUrl
    this.state.gatewayToken = saveRemoteGatewayToken(this.state.gatewayTokenInput)
    this.state.gatewayTokenInput = this.state.gatewayToken
    await this.refreshBackendStatus()
    await this.refreshSessions()
    if (this.state.currentThreadId) {
      await this.openThread(this.state.currentThreadId)
      return
    }
    this.render()
    await this.renderGlass()
  }

  async checkGatewayConnectivity(): Promise<void> {
    const t = getTranslations(this.state.language)
    const gatewayUrl = this.state.gatewayInput.trim()
    const gatewayToken = this.state.gatewayTokenInput.trim()

    if (!gatewayUrl) {
      this.state.gatewayProbeStatus = 'error'
      this.state.gatewayProbeMessage = t.gateway.probeInvalid
      this.render()
      return
    }

    this.state.gatewayProbeStatus = 'checking'
    this.state.gatewayProbeMessage = t.gateway.probeChecking
    this.render()

    try {
      const status = await this.transport.probeGateway(gatewayUrl, gatewayToken)
      this.state.gatewayProbeStatus = 'success'
      this.state.gatewayProbeMessage = t.gateway.probeSuccess(status.backend, status.workspacePath)
      this.appendDebugLog(`gateway:probe:ok:${status.backend}`)
    } catch (error) {
      this.state.gatewayProbeStatus = 'error'
      if (error instanceof TransportRequestError && error.status === 401) {
        this.state.gatewayProbeMessage = t.gateway.probeUnauthorized
      } else if (error instanceof TransportRequestError && error.message === 'Request timed out') {
        this.state.gatewayProbeMessage = t.gateway.probeUnreachable
      } else if (error instanceof TransportRequestError && /fetch|network|failed/i.test(error.message)) {
        this.state.gatewayProbeMessage = t.gateway.probeUnreachable
      } else {
        this.state.gatewayProbeMessage = t.gateway.probeUnknown
      }
      this.appendDebugLog(`gateway:probe:fail:${error instanceof Error ? error.message : String(error)}`)
    }
    this.render()
  }

  async setLanguage(language: LanguageCode): Promise<void> {
    if (language === this.state.language) {
      return
    }
    this.state.language = language
    saveLanguage(language)
    this.render()
    await this.renderGlass()
  }

  setGatewayInput(value: string): void {
    this.state.gatewayInput = value
    this.state.gatewayProbeStatus = 'idle'
    this.state.gatewayProbeMessage = ''
    this.render()
  }

  setGatewayTokenInput(value: string): void {
    this.state.gatewayTokenInput = value
    this.state.gatewayProbeStatus = 'idle'
    this.state.gatewayProbeMessage = ''
    this.render()
  }

  setDraftInput(value: string): void {
    if (this.state.currentThreadId && this.state.draftSegments.length > 0) {
      this.state.draftSegments = []
      clearThreadDraft(this.state.currentThreadId)
    }
    this.state.draftInput = value
    this.render()
    void this.renderGlass()
  }

  setSettingsTab(tab: SettingsTab): void {
    this.state.settingsTab = tab
    this.render()
  }

  openSessionsSheet(): void {
    this.state.sessionsSheetOpen = true
    this.render()
  }

  closeSessionsSheet(): void {
    this.state.sessionsSheetOpen = false
    this.render()
  }

  openSettings(): void {
    this.state.settingsOpen = true
    this.state.settingsTab = 'general'
    this.render()
  }

  closeSettings(): void {
    this.state.settingsOpen = false
    this.render()
  }

  dismissSheets(): void {
    this.state.settingsOpen = false
    this.state.sessionsSheetOpen = false
    this.render()
  }

  setAutoGlassOffSeconds(value: number): void {
    this.state.autoGlassOffSeconds = saveAutoGlassOffSeconds(value)
    this.render()
  }

  async refreshSessions(): Promise<void> {
    try {
      this.state.sessions = await this.transport.listThreads()
      this.appendDebugLog(`sessions:loaded:${this.state.sessions.length}`)
    } catch (error) {
      this.appendDebugLog(`sessions:load-failed:${error instanceof Error ? error.message : String(error)}:keep=${this.state.sessions.length}`)
    }
    this.render()
    await this.renderGlass()
  }

  private async refreshBackendStatus(): Promise<void> {
    try {
      this.state.backendStatus = await this.transport.getBackendStatus()
      this.appendDebugLog(`backend:status:${this.state.backendStatus.backend}`)
    } catch (error) {
      this.state.backendStatus = null
      this.appendDebugLog(`backend:status-failed:${error instanceof Error ? error.message : String(error)}`)
    }
    this.render()
  }

  private async activateThread(threadId: string): Promise<void> {
    try {
      await this.transport.activateThread(threadId)
      this.appendDebugLog(`thread:active:${threadId}`)
      if (this.state.backendStatus?.backend === 'codex') {
        this.state.backendStatus = {
          ...this.state.backendStatus,
          activeThreadId: threadId,
        }
      }
    } catch (error) {
      this.appendDebugLog(`thread:active-failed:${threadId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async syncGlasses(): Promise<void> {
    await this.renderGlass()
  }

  private startRuntimePolling(): void {
    if (this.runtimePollHandle !== null) {
      return
    }
    this.runtimePollHandle = window.setInterval(() => {
      void this.syncRuntimeState()
    }, RUNTIME_POLL_INTERVAL_MS)
  }

  private startSessionPolling(): void {
    if (this.sessionPollHandle !== null) {
      return
    }
    this.sessionPollHandle = window.setInterval(() => {
      void this.syncSessionList()
    }, SESSION_POLL_INTERVAL_MS)
  }

  private async syncSessionList(): Promise<void> {
    try {
      const next = await this.transport.listThreads()
      if (!this.areSessionsEqual(this.state.sessions, next)) {
        this.state.sessions = next
        this.appendDebugLog(`sessions:background:${next.length}`)
        this.render()
      }
    } catch (error) {
      this.appendDebugLog(`sessions:background-failed:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private areSessionsEqual(left: SessionSummary[], right: SessionSummary[]): boolean {
    if (left.length !== right.length) {
      return false
    }
    return left.every((session, index) => {
      const other = right[index]
      return other
        && session.id === other.id
        && session.title === other.title
        && session.preview === other.preview
        && session.updatedAt === other.updatedAt
        && session.status === other.status
    })
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

      if (runtime.running && runtime.turnId && !runtime.lastAgentText.trim()) {
        if (this.autoGlassOffHandle === null) {
          this.scheduleAutoGlassOff(runtime.turnId)
        }
      } else {
        this.clearAutoGlassOff()
      }

      if (runtime.lastAgentText.trim()) {
        await this.wakeGlassAfterResponse()
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
        this.clearAutoGlassOff()
        this.pendingTurnMode = null
        await this.wakeGlassAfterResponse()
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

  async createSession(): Promise<void> {
    const title = `Session ${new Date().toLocaleString('sv-SE').replace('T', ' ')}`
    this.appendDebugLog(`session:create:${title}`)
    const detail = await this.transport.createThread(title)
    if (!detail) {
      this.appendDebugLog('session:create:failed')
      return
    }
    if (this.state.backendStatus?.backend === 'codex') {
      this.state.backendStatus = {
        ...this.state.backendStatus,
        activeThreadId: detail.threadId,
      }
    }
    await this.refreshSessions()
    await this.applyThreadDetail(detail, true)
  }

  async openThread(threadId: string): Promise<void> {
    this.appendDebugLog(`session:open:${threadId}`)
    const detail = await this.transport.resumeThread(threadId) ?? await this.transport.readThread(threadId)
    if (!detail) {
      this.appendDebugLog(`session:missing:${threadId}`)
      return
    }
    await this.activateThread(detail.threadId)
    this.appendDebugLog(`session:open:ok:${threadId}:${trimPreview(detail.title, 32)}`)
    await this.applyThreadDetail(detail, true)
  }

  async sendReply(): Promise<void> {
    await this.sendDraft('reply')
  }

  setDebugExpanded(expanded: boolean): void {
    this.state.debugLogExpanded = expanded
    this.render()
  }

  getPendingDraft(): string {
    return this.getPendingDraftText()
  }

  private async backToSessions(): Promise<void> {
    if (this.voiceSession.isRecording()) {
      await this.stopVoiceRecording()
      return
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
    this.state.glassRoute = 'sessions'
    this.glassSessionsSelectedIndex = 0
    this.glassDraftReviewSelectedIndex = 0
    this.glassDetailPage = 0
    this.render()
    await this.refreshSessions()
  }

  private async backToStandby(): Promise<void> {
    this.state.glassRoute = 'standby'
    this.state.currentThreadId = null
    this.state.currentTitle = ''
    this.state.messages = []
    this.state.draftSegments = []
    this.state.draftInput = ''
    this.state.runtime = null
    this.state.sendFailed = false
    this.state.mode = 'sessions'
    this.glassSessionsSelectedIndex = 0
    this.glassDraftReviewSelectedIndex = 0
    this.glassDetailPage = 0
    this.unsubscribeFromThreadEvents()
    this.render()
    await this.renderGlass()
  }

  private async showGlassSessions(): Promise<void> {
    this.state.glassRoute = 'sessions'
    this.glassSessionsSelectedIndex = 0
    this.render()
    await this.renderGlass()
    void this.refreshSessions()
  }

  private async showGlassDetail(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    this.state.glassRoute = 'detail'
    this.render()
    await this.renderGlass()
  }

  private async showGlassDraftReview(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    this.state.glassRoute = 'draftReview'
    this.glassDraftReviewSelectedIndex = 0
    this.render()
    await this.renderGlass()
  }

  private async rerecordDraft(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    if (this.state.draftSegments.length > 0) {
      this.state.draftSegments = dropLastDraftSegment(this.state.draftSegments)
      saveThreadDraft(this.state.currentThreadId, this.state.draftSegments)
    }
    this.state.glassRoute = 'detail'
    this.glassDetailPage = 0
    this.render()
    await this.renderGlass()
    await this.toggleVoiceRecording()
  }

  private async continueDraftRecording(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    this.state.glassRoute = 'detail'
    this.glassDetailPage = 0
    this.render()
    await this.renderGlass()
    await this.toggleVoiceRecording()
  }

  private async applyThreadDetail(detail: SessionDetail, subscribe = false): Promise<void> {
    this.appendDebugLog(`session:hydrate:${detail.threadId}:messages=${detail.messages.length}`)
    this.state.currentThreadId = detail.threadId
    this.state.currentTitle = detail.title
    this.state.messages = detail.messages.slice()
    this.state.draftSegments = loadThreadDraft(detail.threadId)
    this.state.draftInput = ''
    this.state.sendFailed = false
    this.state.mode = 'reply'
    this.state.glassRoute = 'detail'
    this.state.runtime = await this.loadRuntime(detail.threadId)
    if (this.state.runtime?.running) {
      this.state.mode = 'implement'
    }
    this.glassDraftReviewSelectedIndex = 0
    this.glassDetailPage = 0
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
        this.state.runtime = { ...this.state.runtime, running: true, turnId: event.turnId, status: 'running', lastAgentText: '', error: null }
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
      this.clearAutoGlassOff()
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
      await this.wakeGlassAfterResponse()
      await this.renderGlass()
      return
    }

    if (event.type === 'message-completed') {
      this.state.sendFailed = false
      if (event.role === 'assistant') {
        this.clearPendingResponseWatchdog()
        this.clearAutoGlassOff()
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
      if (event.role === 'assistant') {
        await this.wakeGlassAfterResponse()
      }
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
      this.clearAutoGlassOff()
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
      await this.wakeGlassAfterResponse()
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
      this.clearAutoGlassOff()
      this.state.sendFailed = false
      if (this.state.runtime) {
        this.state.runtime = { ...this.state.runtime, running: false, status: 'error', error: event.message }
      }
      this.pendingTurnMode = null
      this.appendDebugLog(`thread:error:${event.message}`)
      this.render()
      await this.wakeGlassAfterResponse()
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
    return composeDraftText(this.state.draftSegments, this.state.draftInput)
  }

  private addDraftSegment(text: string): void {
    if (!this.state.currentThreadId) {
      return
    }
    this.state.draftSegments = appendDraftSegment(this.state.draftSegments, text)
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
    this.state.glassRoute = 'detail'
    this.glassDetailPage = 0
    this.state.draftSegments = []
    this.state.draftInput = ''
    clearThreadDraft(threadId)
    this.state.runtime = {
      ...(this.state.runtime ?? createEmptyRuntime(threadId)),
      running: true,
      turnId: null,
      status: 'running',
      lastAgentText: '',
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
          lastAgentText: '',
          error: null,
          events: [...this.state.runtime.events, 'Waiting for agent response...'].slice(-10),
        }
      }
      this.appendDebugLog(`turn:start:${mode}:${started.started.turnId}`)
      this.schedulePendingResponseWatchdog(threadId, started.started.turnId)
      this.scheduleAutoGlassOff(started.started.turnId)
      this.render()
      await this.renderGlass()
    } catch (error) {
      this.clearPendingResponseWatchdog()
      this.clearAutoGlassOff()
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

  private scheduleAutoGlassOff(turnId: string): void {
    this.clearAutoGlassOff()
    if (this.state.autoGlassOffSeconds <= 0) {
      return
    }
    this.autoGlassOffHandle = window.setTimeout(() => {
      void this.autoPauseGlassWhileWaiting(turnId)
    }, this.state.autoGlassOffSeconds * 1_000)
  }

  private clearAutoGlassOff(): void {
    if (this.autoGlassOffHandle === null) {
      return
    }
    window.clearTimeout(this.autoGlassOffHandle)
    this.autoGlassOffHandle = null
  }

  private async autoPauseGlassWhileWaiting(turnId: string): Promise<void> {
    if (!this.bridge || !this.state.glassesEnabled || this.state.glassAutoPaused) {
      return
    }
    if (!this.state.runtime?.running || this.state.runtime.turnId !== turnId || this.state.runtime.lastAgentText.trim()) {
      return
    }
    const shutDownResult = await this.bridge.shutDownPageContainer(0)
    if (shutDownResult === true || shutDownResult === 0) {
      this.state.glassAutoPaused = true
      this.startupRendered = false
      this.currentGlassView = 'startup'
      this.lastRenderedGlassHeader = ''
      this.lastRenderedGlassText = ''
      this.state.glassStatus = 'Off while waiting'
      this.appendDebugLog(`glass:auto-off:ok:${turnId}`)
      this.render()
      return
    }
    this.appendDebugLog(`glass:auto-off:fail:${String(shutDownResult)}`)
  }

  private async wakeGlassAfterResponse(): Promise<void> {
    if (!this.state.glassAutoPaused || !this.bridge || !this.state.glassesEnabled) {
      return
    }
    this.appendDebugLog('glass:auto-off:wake')
    this.state.glassAutoPaused = false
    const desired = this.getDesiredGlassPage()
    const createResult = await this.bridge.createStartUpPageContainer(desired.page)
    if (createResult === 0 || createResult === true) {
      this.startupRendered = true
      this.currentGlassView = desired.view
      this.lastRenderedGlassHeader = desired.header
      this.lastRenderedGlassText = desired.text
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog(`glass:auto-off:wake:ok:${desired.view}`)
      this.render()
      return
    }
    this.appendDebugLog(`glass:auto-off:wake:fail:${String(createResult)}`)
    await this.renderGlass()
  }

  async interruptTurn(): Promise<void> {
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

  async toggleVoiceRecording(): Promise<void> {
    if (!this.state.currentThreadId) {
      return
    }
    if (this.voiceSession.isRecording()) {
      await this.stopVoiceRecording()
      return
    }
    try {
      const sttSession = await this.transport.startSttSession(this.state.language)
      this.currentSttSessionId = sttSession.sessionId
    } catch (error) {
      this.state.sendFailed = true
      this.appendDebugLog(`voice:start:failed:${error instanceof Error ? error.message : String(error)}`)
      this.render()
      await this.renderGlass()
      return
    }
    this.sttUploadChain = Promise.resolve()
    this.sttUploadFailed = null
    this.voiceSession.start()
    this.state.voiceState = 'listening'
    this.state.voiceChunkCount = 0
    this.state.glassRoute = 'detail'
    this.glassDetailPage = 0
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
    const stats = this.voiceSession.stop()
    const sttSessionId = this.currentSttSessionId
    this.currentSttSessionId = null
    this.state.voiceState = 'ready'
    this.state.voiceChunkCount = 0
    try {
      await this.sttUploadChain
      if (this.sttUploadFailed) {
        throw this.sttUploadFailed
      }
      const result = sttSessionId
        ? await this.transport.finishSttSession(sttSessionId)
        : { transcript: '', chunkCount: stats.chunkCount, byteLength: stats.byteLength }
      const transcript = result.transcript.trim()
      if (transcript) {
        this.addDraftSegment(transcript)
        this.appendDebugLog(`voice:transcript:${trimPreview(transcript, 48)}`)
        this.state.glassRoute = 'draftReview'
        this.glassDraftReviewSelectedIndex = 0
      } else {
        this.appendDebugLog('voice:transcript:empty')
        this.state.glassRoute = 'detail'
      }
    } catch (error) {
      this.state.sendFailed = true
      this.state.glassRoute = 'detail'
      this.appendDebugLog(`voice:transcript:failed:${error instanceof Error ? error.message : String(error)}`)
    }
    this.render()
    await this.renderGlass()
  }

  private queueSttChunk(chunk: Uint8Array): void {
    const sessionId = this.currentSttSessionId
    if (!sessionId || this.sttUploadFailed) {
      return
    }
    const copy = new Uint8Array(chunk)
    this.sttUploadChain = this.sttUploadChain
      .then(async () => {
        await this.transport.appendSttChunk(sessionId, copy)
      })
      .catch((error) => {
        this.sttUploadFailed = error instanceof Error ? error : new Error(String(error))
        this.appendDebugLog(`voice:chunk-upload:failed:${this.sttUploadFailed.message}`)
      })
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
    const listSelectionIndex = getEventSelectionIndex(event)

    if (event.listEvent?.containerName === GLASS_SESSIONS_LIST_NAME) {
      if (eventType === undefined) {
        eventType = HUB_EVENT_TYPES.CLICK_EVENT
      }
      this.appendDebugLog([
        'glass:sessions:event',
        `type=${String(eventType)}`,
        `index=${String(listSelectionIndex ?? '-')}`,
        `name=${String(event.listEvent.currentSelectItemName ?? '-')}`,
        `sessions=${this.state.sessions.length}`,
      ].join(':'))
      if (typeof listSelectionIndex === 'number' && listSelectionIndex >= 0) {
        this.glassSessionsSelectedIndex = listSelectionIndex
      }
      if (eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
        void this.backToStandby()
        return
      }
      if (eventType === HUB_EVENT_TYPES.SCROLL_TOP_EVENT || eventType === HUB_EVENT_TYPES.SCROLL_BOTTOM_EVENT) {
        return
      }
      const entry = this.resolveGlassSessionEntry(event)
      this.appendDebugLog(`glass:sessions:resolved:${entry?.kind ?? 'none'}:${entry?.label ?? '-'}`)
      if (entry) {
        if (entry.kind === 'create') {
          void this.createSession()
        } else {
          void this.openThread(entry.session.id)
        }
      }
      return
    }

    if (event.listEvent?.containerName === GLASS_REVIEW_LIST_NAME) {
      if (typeof listSelectionIndex === 'number' && listSelectionIndex >= 0) {
        this.glassDraftReviewSelectedIndex = listSelectionIndex
      }
      this.appendDebugLog(`glass:review:event:type=${String(eventType)}:index=${String(listSelectionIndex ?? '-')}`)
      if (eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
        void this.showGlassDetail()
        return
      }
      if (eventType === HUB_EVENT_TYPES.SCROLL_TOP_EVENT || eventType === HUB_EVENT_TYPES.SCROLL_BOTTOM_EVENT) {
        return
      }
      const entry = this.resolveGlassDraftReviewEntry(event)
      this.appendDebugLog(`glass:review:resolved:${entry?.kind ?? 'none'}`)
      if (!entry) {
        return
      }
      if (entry.kind === 'send') {
        void this.sendReply()
        return
      }
      if (entry.kind === 'continue') {
        void this.continueDraftRecording()
        return
      }
      if (entry.kind === 'rerecord') {
        void this.rerecordDraft()
        return
      }
      void this.showGlassDetail()
      return
    }

    const isPrimaryTextEvent = event.textEvent?.containerName === GLASS_MESSAGE_CONTAINER_NAME
    const isRouteFallbackEvent = !event.listEvent && !event.audioEvent && (eventType !== undefined || Boolean(event.sysEvent))
    if (isPrimaryTextEvent || isRouteFallbackEvent) {
      this.appendDebugLog(`glass:route:event:type=${String(eventType)}:route=${this.state.glassRoute}`)
      if (this.state.glassRoute === 'standby') {
        const now = Date.now()
        const isTapLike = this.isTapLikeGlassEvent(event, eventType)
        const rapidTap = isTapLike && (now - this.lastStandbyTapAt) <= GLASS_DOUBLE_TAP_WINDOW_MS
        if (isTapLike) {
          this.lastStandbyTapAt = now
        }
        if (eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT || rapidTap) {
          this.lastStandbyTapAt = 0
          this.appendDebugLog(`glass:standby:open-sessions:${eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT ? 'double' : 'rapid'}`)
          void this.showGlassSessions()
        }
        return
      }

      if (this.state.glassRoute === 'detail') {
        if (eventType === HUB_EVENT_TYPES.SCROLL_TOP_EVENT) {
          this.glassAutoScrollPauseUntil = Date.now() + GLASS_AUTO_SCROLL_PAUSE_AFTER_MANUAL_MS
          this.clearGlassAutoScroll()
          this.glassDetailPage = Math.max(0, this.glassDetailPage - 1)
          this.render()
          void this.renderGlass()
          return
        }
        if (eventType === HUB_EVENT_TYPES.SCROLL_BOTTOM_EVENT) {
          this.glassAutoScrollPauseUntil = Date.now() + GLASS_AUTO_SCROLL_PAUSE_AFTER_MANUAL_MS
          this.clearGlassAutoScroll()
          this.glassDetailPage += 1
          this.render()
          void this.renderGlass()
          return
        }
        if (eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
          if (this.voiceSession.isRecording()) {
            void this.stopVoiceRecording()
            return
          }
          void this.backToSessions()
          return
        }
        if (eventType === HUB_EVENT_TYPES.CLICK_EVENT || this.isTapLikeGlassEvent(event, eventType)) {
          this.appendDebugLog(`glass:detail:${this.voiceSession.isRecording() ? 'stop-recording' : 'start-recording'}:${eventType === HUB_EVENT_TYPES.CLICK_EVENT ? 'click' : 'tap-like'}`)
          void this.toggleVoiceRecording()
          return
        }
      }

      if (this.state.glassRoute === 'draftReview' && eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
        void this.showGlassDetail()
        return
      }
    }

    const audioPcm = event.audioEvent?.audioPcm
    if (!audioPcm || !this.voiceSession.isRecording()) {
      return
    }
    this.voiceSession.pushChunk(audioPcm)
    this.queueSttChunk(audioPcm)
    this.state.voiceChunkCount = this.voiceSession.getStats().chunkCount
    this.render()
    void this.renderGlass()
  }

  private resolveGlassSessionEntry(event: EvenHubEvent): GlassSessionEntry | null {
    const visibleEntries = this.getGlassSessionEntries()
    const incomingIndex = getEventSelectionIndex(event) ?? -1
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

  private resolveGlassDraftReviewEntry(event: EvenHubEvent): GlassDraftReviewEntry | null {
    const entries = this.getGlassDraftReviewEntries()
    const incomingIndex = getEventSelectionIndex(event) ?? -1
    if (incomingIndex >= 0 && incomingIndex < entries.length) {
      return entries[incomingIndex] ?? null
    }
    return entries[this.glassDraftReviewSelectedIndex] ?? entries[0] ?? null
  }

  private isTapLikeGlassEvent(event: EvenHubEvent, eventType: number | undefined): boolean {
    if (eventType === HUB_EVENT_TYPES.CLICK_EVENT || eventType === HUB_EVENT_TYPES.DOUBLE_CLICK_EVENT) {
      return true
    }

    if (event.textEvent || event.listEvent) {
      return eventType === undefined
    }

    if (event.sysEvent) {
      return eventType === undefined || Object.keys(event.sysEvent).length === 0
    }

    return false
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

  private getLatestUserMessage(): ConversationEntry | null {
    for (let index = this.state.messages.length - 1; index >= 0; index -= 1) {
      const message = this.state.messages[index]
      if (message?.role === 'user') {
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

  private getCompactGlassDraftText(): string {
    const t = getTranslations(this.state.language)
    const latestUser = this.getLatestUserMessage()?.text?.trim()
    if (latestUser) {
      return trimMultilinePreview(latestUser, 120)
    }
    return t.glasses.draftEmpty
  }

  private getExpandedGlassDraftText(): string | null {
    const t = getTranslations(this.state.language)
    const draftText = this.getPendingDraftText().trim()
    if (draftText) {
      return trimMultilinePreview(draftText, 700)
    }
    if (this.state.voiceState === 'listening') {
      return t.glasses.draftRecording
    }
    if (this.state.voiceState === 'transcribing') {
      return t.glasses.draftTranscribing
    }
    return null
  }

  private getGlassSessionLabel(session: SessionSummary): string {
    return trimPreview(session.title, 24)
  }

  private getGlassSessionEntries(): GlassSessionEntry[] {
    const t = getTranslations(this.state.language)
    const sessionLimit = Math.max(0, GLASS_SESSION_LIMIT - 1)
    const sessionEntries = this.state.sessions
      .slice(0, sessionLimit)
      .map((session) => ({
        kind: 'session' as const,
        label: this.getGlassSessionLabel(session),
        session,
      }))

    return [
      { kind: 'create', label: t.glasses.createNewSession },
      ...sessionEntries,
    ]
  }

  private getGlassDraftReviewEntries(): GlassDraftReviewEntry[] {
    const t = getTranslations(this.state.language)
    return [
      { kind: 'send', label: t.glasses.actionSend },
      { kind: 'continue', label: t.glasses.reviewContinue },
      { kind: 'rerecord', label: t.glasses.reviewRerecord },
      { kind: 'cancel', label: t.glasses.reviewCancel },
    ]
  }

  private getGlassStatusLabel(): string {
    const t = getTranslations(this.state.language)
    if (this.state.glassRoute === 'sessions') {
      return t.glasses.status.selecting
    }
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

  private getGlassStandbyHeaderText(): string {
    const t = getTranslations(this.state.language)
    return this.buildGlassHeaderLine(t.glasses.standbyTitle, t.glasses.status.waiting)
  }

  private getGlassStandbyBodyText(): string {
    return getTranslations(this.state.language).glasses.standbyBody
  }

  private paginateGlassText(text: string, linesPerPage: number, page: number): { text: string; page: number; pageCount: number } {
    const lines = wrapGlassText(text, GLASS_WRAP_WIDTH)
    const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage))
    const safePage = Math.min(Math.max(page, 0), pageCount - 1)
    const start = safePage * linesPerPage
    return {
      text: lines.slice(start, start + linesPerPage).join('\n'),
      page: safePage,
      pageCount,
    }
  }

  private getGlassUserSectionText(): string {
    const expandedDraft = this.getExpandedGlassDraftText()
    if (expandedDraft) {
      return expandedDraft
    }
    return this.getCompactGlassDraftText()
  }

  private getGlassAgentSectionText(maxLength = 1200): string {
    return trimMultilinePreview(this.getPrimaryGlassMessageText(), maxLength)
  }

  private getDetailGlassBody(): { text: string; pageCount: number; autoScroll: boolean } {
    const t = getTranslations(this.state.language)
    const expandedDraft = this.getExpandedGlassDraftText()
    if (!expandedDraft) {
      const pagedAgent = this.paginateGlassText(this.getGlassAgentSectionText(), GLASS_AGENT_PAGE_LINES, this.glassDetailPage)
      this.glassDetailPage = pagedAgent.page
      return {
        text: [
          t.glasses.agentLabel,
          pagedAgent.text,
        ].join('\n'),
        pageCount: pagedAgent.pageCount,
        autoScroll: Boolean(this.state.runtime?.running) && pagedAgent.pageCount > 1,
      }
    }

    const detailText = [
      t.glasses.userLabel,
      expandedDraft,
      '',
      t.glasses.agentLabel,
      this.getGlassAgentSectionText(),
    ].join('\n')
    const paged = this.paginateGlassText(detailText, GLASS_DETAIL_PAGE_LINES, this.glassDetailPage)
    this.glassDetailPage = paged.page
    return {
      text: paged.text,
      pageCount: paged.pageCount,
      autoScroll: false,
    }
  }

  private getDraftReviewBodyText(): string {
    const t = getTranslations(this.state.language)
    const reviewText = [
      t.glasses.userLabel,
      this.getGlassUserSectionText(),
      '',
      t.glasses.agentLabel,
      trimMultilinePreview(this.getPrimaryGlassMessageText(), 320),
    ].join('\n')
    return this.paginateGlassText(reviewText, GLASS_REVIEW_PAGE_LINES, 0).text
  }

  private buildGlassHeaderLine(title: string, status: string): string {
    const safeTitle = trimPreview(title.replace(/\s+/g, ' ').trim(), GLASS_HEADER_WIDTH - GLASS_STATUS_WIDTH - 1)
    const sessionWidth = Math.max(1, GLASS_HEADER_WIDTH - GLASS_STATUS_WIDTH - 1)
    const sessionLabel = safeTitle.padEnd(sessionWidth, ' ')
    const statusLabel = status.trim().slice(0, GLASS_STATUS_WIDTH).padStart(GLASS_STATUS_WIDTH, ' ')
    return `${sessionLabel} ${statusLabel}`
  }

  private getGlassMessageHeaderText(): string {
    return this.buildGlassHeaderLine(this.state.currentTitle || 'Session', this.getGlassStatusLabel())
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

  private buildStandbyGlassPage(header: string, content: string): CreateStartUpPageContainer {
    return new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          containerID: GLASS_MESSAGE_HEADER_ID,
          containerName: GLASS_MESSAGE_HEADER_NAME,
          content: header,
          xPosition: 8,
          yPosition: 4,
          width: 560,
          height: 24,
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          containerID: GLASS_MESSAGE_CONTAINER_ID,
          containerName: GLASS_MESSAGE_CONTAINER_NAME,
          content,
          xPosition: 8,
          yPosition: 30,
          width: 560,
          height: 236,
          isEventCapture: 1,
        }),
      ],
    })
  }

  private buildDetailGlassPage(header: string, content: string): CreateStartUpPageContainer {
    return this.buildStandbyGlassPage(header, content)
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
          itemWidth: 0,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
        isEventCapture: 1,
        xPosition: 8,
        yPosition: 40,
        width: 560,
        height: 222,
      })],
    })
  }

  private buildDraftReviewGlassPage(): CreateStartUpPageContainer {
    const labels = this.getGlassDraftReviewEntries().map((entry) => entry.label)
    const header = this.buildGlassHeaderLine(this.state.currentTitle || 'Session', getTranslations(this.state.language).glasses.status.draft)
    return new CreateStartUpPageContainer({
      containerTotalNum: 3,
      textObject: [
        new TextContainerProperty({
          containerID: GLASS_REVIEW_TITLE_ID,
          containerName: GLASS_REVIEW_TITLE_NAME,
          content: header,
          xPosition: 8,
          yPosition: 4,
          width: 560,
          height: 24,
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          containerID: GLASS_REVIEW_BODY_ID,
          containerName: GLASS_REVIEW_BODY_NAME,
          content: this.getDraftReviewBodyText(),
          xPosition: 8,
          yPosition: 30,
          width: 560,
          height: 148,
          isEventCapture: 0,
        }),
      ],
      listObject: [new ListContainerProperty({
        containerID: GLASS_REVIEW_LIST_ID,
        containerName: GLASS_REVIEW_LIST_NAME,
        itemContainer: new ListItemContainerProperty({
          itemCount: labels.length,
          itemWidth: 0,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
        isEventCapture: 1,
        xPosition: 8,
        yPosition: 184,
        width: 560,
        height: 78,
      })],
    })
  }

  private getDesiredGlassPage(): { view: GlassRoute; page: CreateStartUpPageContainer; header: string; text: string; autoScroll: boolean; pageCount: number } {
    if (this.state.glassRoute === 'standby') {
      const header = this.getGlassStandbyHeaderText()
      const text = this.getGlassStandbyBodyText()
      return {
        view: 'standby',
        page: this.buildStandbyGlassPage(header, text),
        header,
        text,
        autoScroll: false,
        pageCount: 1,
      }
    }

    if (this.state.glassRoute === 'sessions' || !this.state.currentThreadId) {
      return {
        view: 'sessions',
        page: this.buildSessionListGlassPage(),
        header: '',
        text: '',
        autoScroll: false,
        pageCount: 1,
      }
    }

    if (this.state.glassRoute === 'draftReview') {
      return {
        view: 'draftReview',
        page: this.buildDraftReviewGlassPage(),
        header: '',
        text: '',
        autoScroll: false,
        pageCount: 1,
      }
    }

    const header = this.getGlassMessageHeaderText()
    const detailBody = this.getDetailGlassBody()
    return {
      view: 'detail',
      page: this.buildDetailGlassPage(header, detailBody.text),
      header,
      text: detailBody.text,
      autoScroll: detailBody.autoScroll,
      pageCount: detailBody.pageCount,
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
      this.lastRenderedGlassHeader = desired.header
      this.lastRenderedGlassText = desired.text
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog(`glass:startup-recover:ok:${desired.view}`)
      this.render()
      return true
    }

    this.appendDebugLog(`glass:startup-recover:fail:${String(rebuildResult)}`)
    return false
  }

  private clearGlassAutoScroll(): void {
    if (this.glassAutoScrollHandle === null) {
      return
    }
    window.clearTimeout(this.glassAutoScrollHandle)
    this.glassAutoScrollHandle = null
  }

  private scheduleGlassAutoScroll(enabled: boolean, pageCount: number): void {
    this.clearGlassAutoScroll()
    if (!enabled || pageCount <= 1 || this.state.glassRoute !== 'detail') {
      return
    }
    const now = Date.now()
    const delay = this.glassAutoScrollPauseUntil > now
      ? this.glassAutoScrollPauseUntil - now
      : GLASS_AUTO_SCROLL_INTERVAL_MS
    this.glassAutoScrollHandle = window.setTimeout(() => {
      this.glassAutoScrollHandle = null
      if (this.state.glassRoute !== 'detail') {
        return
      }
      this.glassDetailPage = (this.glassDetailPage + 1) % Math.max(1, pageCount)
      void this.renderGlass()
    }, delay)
  }

  private async createGlassPage(desired: { view: GlassRoute; page: CreateStartUpPageContainer; header: string; text: string }): Promise<boolean> {
    if (!this.bridge) {
      return false
    }

    const createResult = await this.bridge.createStartUpPageContainer(desired.page)
    if (createResult === 0 || createResult === true) {
      this.startupRendered = true
      this.currentGlassView = desired.view
      this.lastRenderedGlassHeader = desired.header
      this.lastRenderedGlassText = desired.text
      this.state.glassStatus = 'Rendered on glasses'
      this.appendDebugLog(`glass:create:${desired.view}:ok`)
      this.render()
      return true
    }

    this.appendDebugLog(`glass:create:${desired.view}:fail:${String(createResult)}`)
    return false
  }

  private async renderGlass(): Promise<void> {
    if (!this.state.glassesEnabled || !this.bridge) {
      this.clearGlassAutoScroll()
      this.state.glassStatus = 'Bridge unavailable'
      this.render()
      return
    }

    if (this.state.glassAutoPaused) {
      this.clearGlassAutoScroll()
      this.state.glassStatus = 'Off while waiting'
      this.render()
      return
    }

    if (!this.startupRendered) {
      this.appendDebugLog('glass:create:startup')
      const startupResult = await this.bridge.createStartUpPageContainer(this.buildStartupGlassPage())
      if (startupResult === 0 || startupResult === true) {
        this.startupRendered = true
        this.currentGlassView = 'startup'
        this.lastRenderedGlassHeader = ''
        this.lastRenderedGlassText = 'Hello World'
        this.clearGlassAutoScroll()
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

    const desired = this.getDesiredGlassPage()
    const isTextPage = desired.view === 'standby' || desired.view === 'detail'
    if (!isTextPage || this.currentGlassView !== desired.view) {
      const rebuildResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(desired.page.toJson()))
      if (rebuildResult === 0 || rebuildResult === true) {
        this.currentGlassView = desired.view
        this.lastRenderedGlassHeader = desired.header
        this.lastRenderedGlassText = desired.text
        this.state.glassStatus = 'Updated on glasses'
        this.appendDebugLog(`glass:rebuild:${desired.view}:ok`)
        this.scheduleGlassAutoScroll(desired.autoScroll, desired.pageCount)
      } else {
        this.appendDebugLog(`glass:rebuild:${desired.view}:fail:${String(rebuildResult)}`)
        const created = await this.createGlassPage(desired)
        if (!created) {
          this.state.glassStatus = `Update failed (code: ${String(rebuildResult)})`
        }
      }
      this.render()
      return
    }

    if (desired.header === this.lastRenderedGlassHeader && desired.text === this.lastRenderedGlassText) {
      this.scheduleGlassAutoScroll(desired.autoScroll, desired.pageCount)
      this.state.glassStatus = 'Updated on glasses'
      this.render()
      return
    }

    if (desired.header !== this.lastRenderedGlassHeader) {
      const headerLength = Math.max(1, this.lastRenderedGlassHeader.length, desired.header.length)
      const headerUpgradeResult = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: GLASS_MESSAGE_HEADER_ID,
        containerName: GLASS_MESSAGE_HEADER_NAME,
        contentOffset: 0,
        contentLength: headerLength,
        content: desired.header,
      }))
      if (headerUpgradeResult === 0 || headerUpgradeResult === true) {
        this.lastRenderedGlassHeader = desired.header
        this.appendDebugLog(`glass:header-upgrade:ok:${headerLength}`)
      } else {
        const fallbackResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(desired.page.toJson()))
        if (fallbackResult === 0 || fallbackResult === true) {
          this.currentGlassView = desired.view
          this.lastRenderedGlassHeader = desired.header
          this.lastRenderedGlassText = desired.text
          this.state.glassStatus = 'Updated on glasses'
          this.appendDebugLog(`glass:rebuild-fallback:${desired.view}:ok`)
        } else {
          this.state.glassStatus = `Update failed (code: ${String(fallbackResult)})`
          this.appendDebugLog(`glass:rebuild-fallback:${desired.view}:fail:${String(fallbackResult)}`)
        }
        this.render()
        return
      }
    }

    const contentLength = Math.max(1, this.lastRenderedGlassText.length, desired.text.length)
    const upgradeResult = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: GLASS_MESSAGE_CONTAINER_ID,
      containerName: GLASS_MESSAGE_CONTAINER_NAME,
      contentOffset: 0,
      contentLength,
      content: desired.text,
    }))
    if (upgradeResult === 0 || upgradeResult === true) {
      this.lastRenderedGlassText = desired.text
      this.state.glassStatus = 'Updated on glasses'
      this.appendDebugLog(`glass:text-upgrade:ok:${contentLength}`)
      this.scheduleGlassAutoScroll(desired.autoScroll, desired.pageCount)
    } else {
      const fallbackResult = await this.bridge.rebuildPageContainer(new RebuildPageContainer(desired.page.toJson()))
      if (fallbackResult === 0 || fallbackResult === true) {
        this.currentGlassView = desired.view
        this.lastRenderedGlassHeader = desired.header
        this.lastRenderedGlassText = desired.text
        this.state.glassStatus = 'Updated on glasses'
        this.appendDebugLog(`glass:rebuild-fallback:${desired.view}:ok`)
        this.scheduleGlassAutoScroll(desired.autoScroll, desired.pageCount)
      } else {
        this.state.glassStatus = `Update failed (code: ${String(fallbackResult)})`
        this.appendDebugLog(`glass:rebuild-fallback:${desired.view}:fail:${String(fallbackResult)}`)
      }
    }
    this.render()
  }

  private render(): void {
    this.snapshot = this.createSnapshot()
    for (const listener of this.listeners) {
      listener()
    }
  }

  private createSnapshot(): Readonly<AppState> {
    return {
      ...this.state,
      sessions: this.state.sessions.slice(),
      messages: this.state.messages.slice(),
      draftSegments: this.state.draftSegments.slice(),
      runtime: this.state.runtime
        ? {
            ...this.state.runtime,
            events: this.state.runtime.events.slice(),
          }
        : null,
      debugLog: this.state.debugLog.slice(),
    }
  }

  getVoiceStateLabel(): string {
    const t = getTranslations(this.state.language)
    if (this.state.voiceState === 'listening') {
      return t.voice.listening(this.state.voiceChunkCount)
    }
    if (this.state.voiceState === 'transcribing') {
      return t.voice.transcribing
    }
    return t.voice.entryMode
  }

  private appendDebugLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
    const entry = `${timestamp} [${this.instanceId}] ${message}`
    this.state.debugLog = [...this.state.debugLog, entry].slice(-200)
    void this.transport.appendDebugLog(entry).catch(() => {})
    console.log(`[agent_terminal] ${message}`)
    this.render()
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }
}
