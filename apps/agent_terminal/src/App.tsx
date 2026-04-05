import { useEffect, useSyncExternalStore } from 'react'
import { AgentTerminalApp, type AppState } from './agent-app'
import { getTranslations, LANGUAGE_LABELS, type LanguageCode } from './i18n'

type Props = {
  controller: AgentTerminalApp
}

function trimPreview(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= length ? normalized : `${normalized.slice(0, Math.max(0, length - 3))}...`
}

function useControllerState(controller: AgentTerminalApp): Readonly<AppState> {
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
}

export function App({ controller }: Props) {
  const state = useControllerState(controller)
  const t = getTranslations(state.language)

  useEffect(() => {
    void controller.init()
  }, [controller])

  const currentLabel = state.currentThreadId ? state.currentTitle || state.currentThreadId : t.sessions.noActiveSession
  const latestMessage = state.messages.length > 0 ? state.messages[state.messages.length - 1]?.text ?? '' : ''
  const subtitle = state.currentThreadId ? trimPreview(latestMessage || t.sessions.noMessagesYet, 96) : t.sessions.openToRead
  const gatewayStatus = state.gatewayUrl
    ? t.gateway.remoteStatus(state.gatewayUrl, Boolean(state.gatewayToken))
    : t.gateway.localDevStatus
  const gatewayProbeMessage = state.gatewayProbeMessage || t.gateway.probeIdle
  const runtimeStatus = state.runtime
    ? [`${t.runtime.status}: ${state.runtime.status}`, state.runtime.running ? t.runtime.turnActive : t.runtime.idle, state.runtime.error ? `${t.runtime.error}: ${state.runtime.error}` : ''].filter(Boolean).join(' · ')
    : t.runtime.noTurn
  const backendLabel = state.backendStatus
    ? `${state.backendStatus.backend}${state.backendStatus.workspacePath ? ` · ${state.backendStatus.workspacePath}` : ''}`
    : 'unavailable'
  const activeThreadLabel = state.backendStatus?.activeThreadId || '-'
  const runtimeLines = [...(state.runtime?.events ?? []), ...(state.runtime?.lastAgentText ? [trimPreview(state.runtime.lastAgentText, 160)] : [])]
  const debugLines = state.debugLogExpanded ? state.debugLog : state.debugLog.slice(-20)
  const pendingDraft = controller.getPendingDraft()

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-main">
          <div id="topbar-session-title" className="topbar-title">{currentLabel}</div>
          <div id="topbar-session-subtitle" className="topbar-subtitle">{subtitle}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn is-secondary mobile-only" id="open-sessions-btn" type="button" onClick={() => controller.openSessionsSheet()}>
            {t.controls.openSessions}
          </button>
          <button className="btn is-secondary" id="open-settings-btn" type="button" onClick={() => controller.openSettings()}>
            {t.controls.openSettings}
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside id="session-rail" className={`session-rail${state.sessionsSheetOpen ? ' is-open' : ''}`}>
          <div className="rail-header">
            <h2>{t.sessions.title}</h2>
            <button className="icon-btn mobile-only" id="close-sessions-btn" type="button" onClick={() => controller.closeSessionsSheet()}>
              {t.controls.close}
            </button>
          </div>
          <div className="rail-actions">
            <button className="btn" id="new-session-btn" type="button" onClick={() => void controller.createSession()}>
              {t.controls.newSession}
            </button>
            <button className="btn is-secondary" id="refresh-sessions-btn" type="button" onClick={() => void controller.refreshSessions()}>
              {t.controls.refreshSessions}
            </button>
          </div>
          <ul id="session-list" className="session-list">
            {state.sessions.length > 0 ? state.sessions.map((session) => (
              <li
                key={session.id}
                className={`session-row${session.id === state.currentThreadId ? ' is-active' : ''}`}
                data-thread-id={session.id}
                onClick={() => {
                  controller.closeSessionsSheet()
                  void controller.openThread(session.id)
                }}
              >
                <div className="session-row-title">{session.title}</div>
                <div className="session-row-preview">{trimPreview(session.preview || t.sessions.noPreviewYet, 72)}</div>
              </li>
            )) : (
              <li className="session-row is-empty">{t.sessions.noSessions}</li>
            )}
          </ul>
        </aside>

        <section className="conversation-shell">
          <ul id="conversation-history" className="chat-list conversation-list">
            {state.messages.length > 0 ? state.messages.map((message) => (
              <li key={message.id} className={`chat-item is-${message.role}`}>
                <div className="chat-role">
                  {message.role === 'assistant' ? t.conversation.assistant : t.conversation.user}
                  {message.isStreaming ? '*' : ''}
                </div>
                <div className="chat-body">{message.text}</div>
              </li>
            )) : (
              <li className="chat-item">{t.conversation.empty}</li>
            )}
          </ul>
        </section>
      </div>

      <section className="composer-shell">
          <div className="composer-meta-row">
          <span id="voice-state" className="composer-meta">{controller.getVoiceStateLabel()}</span>
          <span id="bridge-status-inline" className="composer-meta">{t.runtime.bridge}: {state.bridgeLabel}</span>
        </div>
        <div className="composer-row">
          <textarea
            id="draft-input"
            className="composer-input"
            aria-label={t.voice.draftLabel}
            placeholder={t.voice.draftPlaceholder}
            value={pendingDraft}
            onChange={(event) => controller.setDraftInput(event.currentTarget.value)}
          />
          <div className="composer-actions">
            <button
              className="btn"
              id="send-reply-btn"
              type="button"
              disabled={!state.currentThreadId || !pendingDraft}
              onClick={() => void controller.sendReply()}
            >
              {t.controls.sendReply}
            </button>
            {state.runtime?.running ? (
              <button
                className="btn is-secondary"
                id="interrupt-turn-btn"
                type="button"
                onClick={() => void controller.interruptTurn()}
              >
                {t.controls.interrupt}
              </button>
            ) : (
              <button className="btn is-secondary" id="interrupt-turn-btn" type="button" hidden disabled>
                {t.controls.interrupt}
              </button>
            )}
          </div>
        </div>
      </section>

      <div
        id="sheet-backdrop"
        className={`sheet-backdrop${state.settingsOpen || state.sessionsSheetOpen ? ' is-open' : ''}`}
        onClick={() => controller.dismissSheets()}
      />

      <aside id="settings-sheet" className={`settings-sheet${state.settingsOpen ? ' is-open' : ''}`}>
        <div className="rail-header">
          <h2>{t.settings.title}</h2>
          <button className="icon-btn" id="close-settings-btn" type="button" onClick={() => controller.closeSettings()}>
            {t.controls.close}
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={t.settings.title}>
          <button className={`settings-tab${state.settingsTab === 'general' ? ' is-active' : ''}`} id="settings-tab-general" type="button" onClick={() => controller.setSettingsTab('general')}>
            {t.settings.tabs.general}
          </button>
          <button className={`settings-tab${state.settingsTab === 'gateway' ? ' is-active' : ''}`} id="settings-tab-gateway" type="button" onClick={() => controller.setSettingsTab('gateway')}>
            {t.settings.tabs.gateway}
          </button>
          <button className={`settings-tab${state.settingsTab === 'runtime' ? ' is-active' : ''}`} id="settings-tab-runtime" type="button" onClick={() => controller.setSettingsTab('runtime')}>
            {t.settings.tabs.runtime}
          </button>
        </div>

        <section id="settings-panel-general" className={`sheet-section settings-panel${state.settingsTab === 'general' ? ' is-active' : ''}`}>
          <label className="language-control" htmlFor="language-select">
            <span>{t.controls.language}</span>
            <select
              id="language-select"
              className="language-select"
              value={state.language}
              onChange={(event) => void controller.setLanguage(event.currentTarget.value as LanguageCode)}
            >
              {LANGUAGE_LABELS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="controls-row">
            <button className="btn is-secondary" id="sync-glasses-btn" type="button" disabled={state.bridgeLabel !== 'Connected'} onClick={() => void controller.syncGlasses()}>
              {t.controls.syncGlasses}
            </button>
          </div>
          <div>
            <label className="draft-label" htmlFor="auto-glass-off-input">{t.settings.autoGlassOffSeconds}</label>
            <input
              id="auto-glass-off-input"
              className="draft-input gateway-input"
              type="number"
              min="0"
              step="1"
              value={state.autoGlassOffSeconds > 0 ? String(state.autoGlassOffSeconds) : '0'}
              onChange={(event) => controller.setAutoGlassOffSeconds(Number.parseInt(event.currentTarget.value || '0', 10))}
            />
            <p className="panel-copy">{t.settings.autoGlassOffHint}</p>
          </div>
        </section>

        <section id="settings-panel-gateway" className={`sheet-section settings-panel${state.settingsTab === 'gateway' ? ' is-active' : ''}`}>
          <h3>{t.gateway.title}</h3>
          <p id="gateway-status" className="bridge-status"><strong>{t.gateway.statusLabel}:</strong> {gatewayStatus}</p>
          <div className="controls">
            <div>
              <label className="draft-label" htmlFor="gateway-input">{t.gateway.remoteLabel}</label>
              <input
                id="gateway-input"
                className="draft-input gateway-input"
                type="url"
                placeholder={t.gateway.remotePlaceholder}
                value={state.gatewayInput}
                onChange={(event) => controller.setGatewayInput(event.currentTarget.value)}
              />
            </div>
            <div>
              <label className="draft-label" htmlFor="gateway-token-input">{t.gateway.tokenLabel}</label>
              <input
                id="gateway-token-input"
                className="draft-input gateway-input"
                type="password"
                placeholder={t.gateway.tokenPlaceholder}
                value={state.gatewayTokenInput}
                onChange={(event) => controller.setGatewayTokenInput(event.currentTarget.value)}
              />
            </div>
            <div>
              <p className="panel-copy">{t.gateway.copy}</p>
            </div>
            <div className="controls-row">
              <button className="btn" id="save-gateway-btn" type="button" onClick={() => void controller.saveGateway()}>{t.controls.saveGateway}</button>
              <button
                className="btn is-secondary"
                id="check-gateway-btn"
                type="button"
                onClick={() => void controller.checkGatewayConnectivity()}
                disabled={state.gatewayProbeStatus === 'checking'}
              >
                {state.gatewayProbeStatus === 'checking' ? t.gateway.probeChecking : t.controls.checkGateway}
              </button>
            </div>
            <p
              id="gateway-probe-status"
              className={`bridge-status gateway-probe is-${state.gatewayProbeStatus}`}
            >
              <strong>{t.gateway.probeLabel}:</strong> {gatewayProbeMessage}
            </p>
          </div>
        </section>

        <section id="settings-panel-runtime" className={`sheet-section settings-panel${state.settingsTab === 'runtime' ? ' is-active' : ''}`}>
          <div className="settings-stack">
            <p className="bridge-status"><strong>{t.runtime.bridge}:</strong> <span id="bridge-status-text">{state.bridgeLabel}</span></p>
            <p className="bridge-status"><strong>{t.runtime.backend}:</strong> <span id="backend-status-text">{backendLabel}</span></p>
            <p className="bridge-status"><strong>{t.runtime.activeThread}:</strong> <span id="active-thread-status-text">{activeThreadLabel}</span></p>
            <p id="runtime-status" className="phase">{`${runtimeStatus} · ${t.runtime.glass}: ${state.glassStatus}`}</p>
            <ul id="runtime-events" className="event-list">
              {runtimeLines.length > 0 ? runtimeLines.slice(-8).map((line, index) => (
                <li key={`${line}-${index}`} className="event-item">{line}</li>
              )) : (
                <li className="event-item">{t.runtime.noEvents}</li>
              )}
            </ul>
            <section className="sheet-section">
              <p className="panel-copy">{t.debug.copy}</p>
              <textarea
                id="debug-log"
                className={`debug-log${state.debugLogExpanded ? ' is-active' : ''}`}
                readOnly
                spellCheck={false}
                value={debugLines.length > 0 ? debugLines.join('\n') : t.debug.empty}
                onFocus={() => controller.setDebugExpanded(true)}
                onBlur={() => controller.setDebugExpanded(false)}
              />
            </section>
          </div>
        </section>
      </aside>
    </main>
  )
}
