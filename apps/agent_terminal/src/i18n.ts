export type LanguageCode = 'en' | 'ja'

type TranslationSet = {
  hero: {
    eyebrow: string
    title: string
    subtitle: string
  }
  mode: {
    sessions: string
    reply: string
    implement: string
  }
  controls: {
    language: string
    openSessions: string
    openSettings: string
    close: string
    syncGlasses: string
    saveGateway: string
    checkGateway: string
    refreshSessions: string
    newSession: string
    sendReply: string
    interrupt: string
  }
  gateway: {
    title: string
    copy: string
    statusLabel: string
    remoteLabel: string
    tokenLabel: string
    probeLabel: string
    remotePlaceholder: string
    tokenPlaceholder: string
    localDevStatus: string
    remoteStatus: (url: string, tokenProtected: boolean) => string
    probeIdle: string
    probeChecking: string
    probeSuccess: (backend: string, workspacePath: string) => string
    probeUnauthorized: string
    probeUnreachable: string
    probeInvalid: string
    probeUnknown: string
  }
  settings: {
    title: string
    copy: string
    tabs: {
      general: string
      gateway: string
      runtime: string
    }
    advanced: string
    showDebug: string
    appendDebug: string
    autoGlassOffSeconds: string
    autoGlassOffHint: string
  }
  sessions: {
    title: string
    copy: string
    currentLabel: string
    sessionListLabel: string
    noSessions: string
    noSavedSessions: string
    tapToResume: string
    openToRead: string
    latestLabel: string
    noActiveSession: string
    noMessagesYet: string
    noPreviewYet: string
  }
  voice: {
    title: string
    copy: string
    label: string
    draftLabel: string
    draftPlaceholder: string
    entryMode: string
    ready: string
    listening: (chunks: number) => string
    transcribing: string
  }
  conversation: {
    title: string
    copy: string
    empty: string
    user: string
    assistant: string
    streaming: string
  }
  runtime: {
    title: string
    bridge: string
    backend: string
    activeThread: string
    workspace: string
    noTurn: string
    noEvents: string
    status: string
    turnActive: string
    idle: string
    error: string
    glass: string
  }
  debug: {
    title: string
    copy: string
    empty: string
  }
  glasses: {
    sessionsTitle: string
    createNewSession: string
    standbyTitle: string
    standbyBody: string
    tapToResume: string
    noSavedSessions: string
    noMessagesYet: string
    userLabel: string
    agentLabel: string
    draftEmpty: string
    draftRecording: string
    draftTranscribing: string
    actionSend: string
    reviewContinue: string
    reviewRerecord: string
    reviewCancel: string
    status: {
      selecting: string
      waiting: string
      listening: string
      transcribing: string
      running: string
      draft: string
      stopped: string
      error: string
    }
  }
}

export const LANGUAGE_LABELS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

const translations: Record<LanguageCode, TranslationSet> = {
  en: {
    hero: {
      eyebrow: 'Even G2 Agent Companion',
      title: 'Agent Terminal',
      subtitle: 'Pick a Codex session, resume it on the glasses, then speak the next reply while the web app keeps the full conversation history.',
    },
    mode: {
      sessions: 'Sessions',
      reply: 'Reply',
      implement: 'Implement',
    },
    controls: {
      language: 'Language',
      openSessions: 'Sessions',
      openSettings: 'Settings',
      close: 'Close',
      syncGlasses: 'Sync Glasses',
      saveGateway: 'Save Gateway',
      checkGateway: 'Check',
      refreshSessions: 'Refresh Sessions',
      newSession: 'New Session',
      sendReply: 'Send',
      interrupt: 'Stop',
    },
    gateway: {
      title: 'Gateway',
      copy: 'Use a remote Codex gateway over Tailscale. Recording sends PCM to the gateway, and OpenAI STT returns draft text before you send it.',
      statusLabel: 'Saved URL',
      remoteLabel: 'Remote gateway URL',
      tokenLabel: 'Gateway token',
      probeLabel: 'Connectivity',
      remotePlaceholder: 'http://100.80.199.121:8791/api',
      tokenPlaceholder: 'Optional',
      localDevStatus: 'Local dev proxy (browser / simulator only)',
      remoteStatus: (url, tokenProtected) => `${url} (${tokenProtected ? 'token protected' : 'no token'})`,
      probeIdle: 'Not checked yet.',
      probeChecking: 'Checking...',
      probeSuccess: (backend, workspacePath) => `Connected: ${backend}${workspacePath ? ` · ${workspacePath}` : ''}`,
      probeUnauthorized: 'Authentication failed.',
      probeUnreachable: 'Gateway unreachable.',
      probeInvalid: 'Enter a gateway URL first.',
      probeUnknown: 'Gateway check failed.',
    },
    settings: {
      title: 'Settings',
      copy: 'Use the web app mainly for session switching, configuration, and reading the full conversation history.',
      tabs: {
        general: 'General',
        gateway: 'Gateway',
        runtime: 'Runtime',
      },
      advanced: 'Advanced settings',
      showDebug: 'Show debug log',
      appendDebug: 'Append new debug lines to the end',
      autoGlassOffSeconds: 'Auto-hide glasses while waiting (sec)',
      autoGlassOffHint: '0 disables auto-hide. The display returns when the agent responds.',
    },
    sessions: {
      title: 'Sessions',
      copy: 'The glasses boot into this shortlist. Open a session to resume it, or start a fresh one.',
      currentLabel: 'Current',
      sessionListLabel: 'Session list',
      noSessions: 'No sessions yet. Create one to start a new Codex thread.',
      noSavedSessions: 'No saved sessions',
      tapToResume: 'Tap to resume',
      openToRead: 'Open a session to read the latest message.',
      latestLabel: 'Latest',
      noActiveSession: 'No active session',
      noMessagesYet: 'No messages yet. Speak to start.',
      noPreviewYet: 'No preview yet.',
    },
    voice: {
      title: 'Voice Reply',
      copy: 'Hold to record, review the transcript locally, then send it to the active session. You can also type directly in the web composer.',
      label: 'Voice',
      draftLabel: 'Local reply draft',
      draftPlaceholder: 'Voice reply segments stay local until you send them.',
      entryMode: 'Hold to record or type here',
      ready: 'Ready',
      listening: (chunks) => `Listening (${chunks} chunk${chunks === 1 ? '' : 's'})`,
      transcribing: 'Transcribing',
    },
    conversation: {
      title: 'Conversation',
      copy: 'The web app keeps the full Codex conversation. The glasses mirror only the latest message and your local draft.',
      empty: 'No conversation yet.',
      user: 'USER',
      assistant: 'AGENT',
      streaming: 'streaming',
    },
    runtime: {
      title: 'Runtime',
      bridge: 'Bridge',
      backend: 'Backend',
      activeThread: 'Active thread',
      workspace: 'Workspace',
      noTurn: 'No active turn.',
      noEvents: 'No runtime events yet.',
      status: 'Status',
      turnActive: 'turn active',
      idle: 'idle',
      error: 'error',
      glass: 'Glass',
    },
    debug: {
      title: 'Debug',
      copy: 'Latest bridge and gateway events.',
      empty: 'No debug events yet.',
    },
    glasses: {
      sessionsTitle: 'Sessions',
      createNewSession: 'Create New Session',
      standbyTitle: 'Agent',
      standbyBody: 'Double tap to open sessions.',
      tapToResume: 'Tap to resume',
      noSavedSessions: 'No saved sessions',
      noMessagesYet: 'No messages yet. Speak to start.',
      userLabel: 'USER',
      agentLabel: 'AGENT',
      draftEmpty: '-',
      draftRecording: 'recording...',
      draftTranscribing: 'transcribing...',
      actionSend: 'Send',
      reviewContinue: 'Continue',
      reviewRerecord: 'Re-record',
      reviewCancel: 'Cancel',
      status: {
        selecting: 'PICK',
        waiting: 'WAIT',
        listening: 'REC',
        transcribing: 'TX',
        running: 'RUN',
        draft: 'DRAFT',
        stopped: 'STOP',
        error: 'ERR',
      },
    },
  },
  ja: {
    hero: {
      eyebrow: 'Even G2 Agent Companion',
      title: 'Agent Terminal',
      subtitle: 'Codex セッションを選んでメガネで再開し、そのまま音声で次の指示を送りつつ、Web 側では会話履歴全体を確認できます。',
    },
    mode: {
      sessions: 'セッション',
      reply: '返信',
      implement: '実装',
    },
    controls: {
      language: '言語',
      openSessions: 'セッション一覧',
      openSettings: '設定',
      close: '閉じる',
      syncGlasses: 'メガネ同期',
      saveGateway: 'Gateway保存',
      checkGateway: '疎通確認',
      refreshSessions: 'セッション更新',
      newSession: '新規セッション',
      sendReply: '送信',
      interrupt: '停止',
    },
    gateway: {
      title: 'Gateway',
      copy: 'Tailscale 越しの remote Codex gateway を使います。録音した PCM は gateway に送られ、OpenAI STT が下書きを返します。',
      statusLabel: '保存済みURL',
      remoteLabel: 'Remote gateway URL',
      tokenLabel: 'Gateway token',
      probeLabel: '疎通確認',
      remotePlaceholder: 'http://100.80.199.121:8791/api',
      tokenPlaceholder: '任意',
      localDevStatus: 'ローカル開発用 proxy（browser / simulator 専用）',
      remoteStatus: (url, tokenProtected) => `${url} (${tokenProtected ? 'token あり' : 'token なし'})`,
      probeIdle: '未確認',
      probeChecking: '確認中...',
      probeSuccess: (backend, workspacePath) => `接続OK: ${backend}${workspacePath ? ` · ${workspacePath}` : ''}`,
      probeUnauthorized: '認証に失敗しました。',
      probeUnreachable: 'Gateway に到達できません。',
      probeInvalid: '先に Gateway URL を入力してください。',
      probeUnknown: '疎通確認に失敗しました。',
    },
    settings: {
      title: '設定',
      copy: 'Web 側はセッション切替、設定変更、会話履歴の確認を主用途にします。',
      tabs: {
        general: '一般',
        gateway: 'Gateway',
        runtime: 'Runtime',
      },
      advanced: '詳細設定',
      showDebug: 'Debugログを表示',
      appendDebug: '新しいDebugログを末尾に追加',
      autoGlassOffSeconds: '応答待ちでメガネOFF（秒）',
      autoGlassOffHint: '0で無効です。返答が来たら自動で再表示します。',
    },
    sessions: {
      title: 'セッション',
      copy: 'メガネはこの一覧から始まります。既存セッションを再開するか、新規に作成します。',
      currentLabel: '現在',
      sessionListLabel: 'セッション一覧',
      noSessions: 'まだセッションがありません。新規セッションを作成してください。',
      noSavedSessions: '保存済みセッションなし',
      tapToResume: 'タップで再開',
      openToRead: 'セッションを開くと最新メッセージが表示されます。',
      latestLabel: '最新',
      noActiveSession: 'アクティブなセッションなし',
      noMessagesYet: 'まだ会話がありません。音声で開始してください。',
      noPreviewYet: 'まだプレビューなし。',
    },
    voice: {
      title: '音声返信',
      copy: '録音して文字起こし結果を確認し、必要なら修正してから送信します。Web では直接入力もできます。',
      label: '音声',
      draftLabel: 'ローカル返信下書き',
      draftPlaceholder: '音声で作った下書きは送信するまでローカルにだけ保持されます。',
      entryMode: '録音または直接入力',
      ready: '待機中',
      listening: (chunks) => `録音中 (${chunks})`,
      transcribing: '文字起こし中',
    },
    conversation: {
      title: '会話履歴',
      copy: 'Web 側には Codex との会話履歴全体を表示し、メガネ側には最新メッセージだけを表示します。',
      empty: 'まだ会話はありません。',
      user: 'USER',
      assistant: 'AGENT',
      streaming: 'streaming',
    },
    runtime: {
      title: 'Runtime',
      bridge: 'Bridge',
      backend: 'Backend',
      activeThread: 'Active thread',
      workspace: 'Workspace',
      noTurn: '進行中の turn はありません。',
      noEvents: 'runtime event はまだありません。',
      status: '状態',
      turnActive: 'turn 実行中',
      idle: '待機中',
      error: 'エラー',
      glass: 'Glass',
    },
    debug: {
      title: 'Debug',
      copy: 'bridge と gateway の最新ログです。',
      empty: 'debug log はまだありません。',
    },
    glasses: {
      sessionsTitle: 'セッション',
      createNewSession: '新規セッション作成',
      standbyTitle: '待機',
      standbyBody: 'ダブルタップでセッション一覧を開きます。',
      tapToResume: 'タップで再開',
      noSavedSessions: '保存済みなし',
      noMessagesYet: 'まだ会話がありません。音声で開始してください。',
      userLabel: 'USER',
      agentLabel: 'AGENT',
      draftEmpty: '-',
      draftRecording: '録音中...',
      draftTranscribing: '変換中...',
      actionSend: '送信',
      reviewContinue: '続ける',
      reviewRerecord: '再録',
      reviewCancel: '取消',
      status: {
        selecting: '選択中',
        waiting: '入力待',
        listening: '録音中',
        transcribing: '変換中',
        running: '応答中',
        draft: '下書有',
        stopped: '停止中',
        error: 'エラー',
      },
    },
  },
}

const LANGUAGE_STORAGE_KEY = 'agent-terminal.language'

export function getLanguageLabel(language: LanguageCode): string {
  return LANGUAGE_LABELS.find((option) => option.value === language)?.label ?? language
}

export function detectInitialLanguage(): LanguageCode {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'ja' || stored === 'en') {
      return stored
    }
  } catch {
    // Ignore localStorage failures.
  }

  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en'
  return browserLanguage.startsWith('ja') ? 'ja' : 'en'
}

export function saveLanguage(language: LanguageCode): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Ignore localStorage failures.
  }
}

export function getTranslations(language: LanguageCode): TranslationSet {
  return translations[language]
}
