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
    useEmbeddedGateway: string
    refreshSessions: string
    newSession: string
    holdToTalk: string
    stopRecording: string
    sendReply: string
    interrupt: string
  }
  gateway: {
    title: string
    copy: string
    statusLabel: string
    remoteLabel: string
    tokenLabel: string
    remotePlaceholder: string
    tokenPlaceholder: string
    embeddedStatus: string
    remoteStatus: (url: string, tokenProtected: boolean) => string
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
    ready: string
    listening: (chunks: number) => string
    transcribing: string
    noteReceived: string
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
    tapToResume: string
    noSavedSessions: string
    noMessagesYet: string
    userLabel: string
    agentLabel: string
    draftEmpty: string
    draftRecording: string
    draftTranscribing: string
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
      useEmbeddedGateway: 'Use Embedded Gateway',
      refreshSessions: 'Refresh Sessions',
      newSession: 'New Session',
      holdToTalk: 'Hold To Talk',
      stopRecording: 'Stop Recording',
      sendReply: 'Send',
      interrupt: 'Stop',
    },
    gateway: {
      title: 'Gateway',
      copy: 'Use the embedded gateway in local development. Private builds can point to a remote gateway over Tailscale.',
      statusLabel: 'Gateway',
      remoteLabel: 'Remote gateway URL',
      tokenLabel: 'Gateway token',
      remotePlaceholder: 'http://100.80.199.121:8787/api',
      tokenPlaceholder: 'Optional',
      embeddedStatus: 'Embedded dev server / local mock fallback',
      remoteStatus: (url, tokenProtected) => `Remote gateway: ${url} (${tokenProtected ? 'token protected' : 'no token'})`,
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
      copy: 'The glasses show the latest message and your current local draft. Tap the message area on the glasses to start or stop recording.',
      label: 'Voice',
      draftLabel: 'Local reply draft',
      draftPlaceholder: 'Voice reply segments stay local until you send them.',
      ready: 'Ready',
      listening: (chunks) => `Listening (${chunks} chunk${chunks === 1 ? '' : 's'})`,
      transcribing: 'Transcribing',
      noteReceived: 'Voice note received.',
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
      tapToResume: 'Tap to resume',
      noSavedSessions: 'No saved sessions',
      noMessagesYet: 'No messages yet. Speak to start.',
      userLabel: 'USER',
      agentLabel: 'AGENT',
      draftEmpty: '-',
      draftRecording: 'recording...',
      draftTranscribing: 'transcribing...',
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
      openSessions: 'セッション',
      openSettings: '設定',
      close: '閉じる',
      syncGlasses: 'メガネ同期',
      saveGateway: 'Gateway保存',
      useEmbeddedGateway: '組み込みGatewayを使う',
      refreshSessions: 'セッション更新',
      newSession: '新規セッション',
      holdToTalk: '録音',
      stopRecording: '停止',
      sendReply: '送信',
      interrupt: '停止',
    },
    gateway: {
      title: 'Gateway',
      copy: 'ローカル開発では組み込み Gateway を使います。private build では Tailscale 越しの remote gateway も指定できます。',
      statusLabel: 'Gateway',
      remoteLabel: 'Remote gateway URL',
      tokenLabel: 'Gateway token',
      remotePlaceholder: 'http://100.80.199.121:8787/api',
      tokenPlaceholder: '任意',
      embeddedStatus: '組み込み dev server / ローカル mock fallback',
      remoteStatus: (url, tokenProtected) => `Remote gateway: ${url} (${tokenProtected ? 'token あり' : 'token なし'})`,
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
      copy: 'メガネには最新メッセージとローカル下書きだけを表示します。メッセージ領域をタップすると録音を開始・停止します。',
      label: '音声',
      draftLabel: 'ローカル返信下書き',
      draftPlaceholder: '音声で作った下書きは送信するまでローカルにだけ保持されます。',
      ready: '待機中',
      listening: (chunks) => `録音中 (${chunks})`,
      transcribing: '文字起こし中',
      noteReceived: '音声メモを受信しました。',
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
      tapToResume: 'タップで再開',
      noSavedSessions: '保存済みなし',
      noMessagesYet: 'まだ会話がありません。音声で開始してください。',
      userLabel: 'USER',
      agentLabel: 'AGENT',
      draftEmpty: '-',
      draftRecording: '録音中...',
      draftTranscribing: '変換中...',
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
