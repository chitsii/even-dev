# Agent Terminal Design

この文書は、Even G2 上でコーディングエージェントを操作する app の設計メモです。

対象ユースケース:

1. 眼鏡から仕様を口頭で入力する
2. エージェントと壁打ちして仕様を固める
3. 実装を開始させる
4. 実装中の状況を眼鏡で監視する

重要な前提:

- 眼鏡は terminal 全文表示デバイスではない
- 眼鏡の役割は `入力`, `確認`, `監視`, `軽い操作`
- 実際の agent 実行はサーバー側に置く
- 音声入力は push-to-talk 前提
- コーディングエージェントは adapter で抽象化し、Claude Code / Codex などを差し替え可能にする

## 1. Product Goal

この app は「眼鏡から terminal を叩く」のではなく、「仕様会話と実装監視を行う agent companion」であるべきです。

やりたいこと:

- 仕様メモを音声で積む
- 送信前に発話単位で編集する
- エージェントの返答全文を読む
- 実装フェーズでは進捗だけを見る
- 必要時だけ停止・質問・承認する

やらないこと:

- raw terminal 全文を眼鏡上で読む
- 文字単位の細かい編集
- agent 固有プロトコルを UI に露出する

## 2. UX Principles

### 2.1 入力モデル

音声入力は `1 発話 = 1 segment` として扱う。

segment 例:

- 「タイマー画面のラベルをもっと短くしたい」
- 「モバイルでも崩れないようにして」
- 「ただし今の配色は維持」

この segment を送信前に並べて見せる。

### 2.2 編集モデル

文字単位編集はしない。編集は segment 単位に限定する。

必要な操作:

- `最後を削除`
- `選択した文を削除`
- `全部消す`
- `追加で話す`
- `送信`

### 2.3 表示モデル

眼鏡に表示するのは mode ごとに異なる。

表示対象:

- 現在の phase
- 直近の user draft
- Discuss 中の agent 返答全文
- 実装中の進捗
- 必要なユーザー確認

補足:

- `Discuss` は全文表示を優先する
- `Implement` は raw terminal ではなく status と summary を出す
- 長文の折り返しは保存せず、描画時に app 側で行う

## 3. UI Modes

app は 3 モードで十分。

補足:

- app 起動直後は `Session chooser` から入る
- 眼鏡が常時表示ではない前提なので、`Resume Last / New Session / Recent Sessions` は必須
- `End session` は current task を `closed` にして chooser へ戻る

### 3.1 Draft

目的:

- 音声で仕様を積む
- 送信前編集をする

表示:

- 状態: `Listening`, `Transcribing`, `Ready`
- draft segments 一覧
- 操作: `Hold to talk`, `Send`, `Undo`, `Clear`

### 3.2 Discuss

目的:

- 壁打ちして仕様を固める

表示:

- エージェント返答全文
- 現在の仕様要約
- 操作: `スクロール`, `続きを話す`, `実装へ進む`, `質問する`

### 3.3 Implement

目的:

- 実装を監視する

表示:

- phase: `thinking`, `editing`, `testing`, `waiting approval`, `done`, `error`
- 編集中ファイル
- 直近 summary
- 操作: `停止`, `質問する`, `承認`

## 4. Architecture

構成は 3 層。

1. Even G2 app
2. Agent Gateway Server
3. Agent Adapter

### 4.1 Even G2 app

責務:

- draft/discuss/implement の表示
- push-to-talk 音声入力
- server との WebSocket/SSE 通信
- user 操作の送信

非責務:

- agent 固有実装
- repo 上のコマンド実行
- STT の本体処理

### 4.2 Agent Gateway Server

責務:

- user session 管理
- draft segment 管理
- STT パイプライン
- agent adapter 呼び出し
- event の正規化
- UI 向け discuss/implement 表示データ生成

### 4.3 Agent Adapter

責務:

- Claude Code / Codex / 将来の別 agent を共通 I/F に載せる
- CLI / PTY / API 差分を吸収する
- raw event を共通 event へ変換する

## 5. Agent Adapter Design

エージェントは adapter 抽象で扱う。

### 5.1 Core Types

```ts
export type AgentKind = 'claude-code' | 'codex'

export type AgentSessionConfig = {
  kind: AgentKind
  workspacePath: string
  repoPath?: string
  branch?: string
  env?: Record<string, string>
}

export type AgentPrompt = {
  text: string
  mode: 'discuss' | 'implement'
  metadata?: Record<string, unknown>
}

export type AgentAction =
  | { type: 'send-prompt'; prompt: AgentPrompt }
  | { type: 'interrupt' }
  | { type: 'approve'; approvalId: string }
  | { type: 'reject'; approvalId: string }
  | { type: 'ask'; text: string }

export type AgentEvent =
  | { type: 'session-started'; sessionId: string }
  | { type: 'status'; phase: 'idle' | 'thinking' | 'editing' | 'testing' | 'waiting-approval' | 'done' | 'error'; message: string }
  | { type: 'message'; mode: 'discuss' | 'implement'; text: string }
  | { type: 'summary'; text: string }
  | { type: 'approval-request'; approvalId: string; reason: string }
  | { type: 'file-change'; path: string }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }

export type AgentCapabilities = {
  supportsApproval: boolean
  supportsInterrupt: boolean
  supportsStructuredFileChanges: boolean
}

export interface AgentAdapter {
  kind: AgentKind
  capabilities: AgentCapabilities
  createSession(config: AgentSessionConfig): Promise<AgentRuntime>
}

export interface AgentRuntime {
  sessionId: string
  dispatch(action: AgentAction): Promise<void>
  subscribe(listener: (event: AgentEvent) => void): () => void
  close(): Promise<void>
}
```

### 5.2 Design Rules

- UI は `AgentEvent` だけを見る
- server の上位ロジックも `AgentAction` / `AgentEvent` にだけ依存する
- raw stdout / stderr を UI に直接流さない
- approval が無い agent は event を出さない
- agent 差分は adapter 内に閉じ込める

### 5.3 Registry

```ts
class AgentAdapterRegistry {
  private adapters = new Map<AgentKind, AgentAdapter>()

  register(adapter: AgentAdapter) {
    this.adapters.set(adapter.kind, adapter)
  }

  get(kind: AgentKind): AgentAdapter {
    const adapter = this.adapters.get(kind)
    if (!adapter) throw new Error(`Missing adapter: ${kind}`)
    return adapter
  }
}
```

## 6. Server Responsibilities

server は app ごとの `server/` 配下に置ける。`even-dev` は `server/package.json` があれば自動起動する。

参考:

- [vite-plugins/app-server.ts](C:/Users/tishi/programming/eveng2/even-dev/vite-plugins/app-server.ts)

### 6.1 Session Manager

責務:

- user session lifecycle
- 現在の mode
- draft segments
- 対象 workspace
- 対象 agent kind
- event buffer

session lifecycle の最低要件:

- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks`
- `POST /tasks/:id/close`
- `POST /session/resume-last`

### 6.2 Draft Manager

責務:

- segment の追加
- 最後の削除
- 任意 id の削除
- 全消し
- 送信用 prompt 組み立て

### 6.3 STT Pipeline

責務:

- PCM chunk 受信
- VAD または push-to-talk close
- speech-to-text
- normalized text を segment に変換

### 6.4 Event Summarizer

責務:

- `Discuss` では全文表示用 message を保持する
- `Implement` では眼鏡向け summary に圧縮する
- `editing 3 files`
- `running tests`
- `waiting for approval`
- `completed`

### 6.5 Discuss Renderer

責務:

- server または app に渡す生テキストの保持
- discuss reply の最新版管理
- app 側スクロール用 state との整合

方針:

- 正規データは `rawText`
- 折り返し済み文字列は保存しない
- 眼鏡へ送る直前に app 側で折り返す

## 7. Audio Flow

SDK は `audioControl(true)` と `onEvenHubEvent(... event.audioEvent.audioPcm ...)` を提供する。

参考:

- [docs/even-g2-sdk-reference.md](C:/Users/tishi/programming/eveng2/even-dev/docs/even-g2-sdk-reference.md)
- [README.md](C:/Users/tishi/programming/eveng2/even-dev/README.md)

基本フロー:

1. 眼鏡 UI を初期化
2. user が `Hold to talk`
3. app が `audioControl(true)`
4. `audioEvent.audioPcm` を chunk で受ける
5. server に stream
6. user が離す
7. app が `audioControl(false)`
8. server が STT finalize
9. 1 発話 = 1 segment に変換

### 7.1 Why Push-to-Talk

- 誤認識を減らせる
- 通信量を抑えられる
- terminal/agent 向け命令文は短い
- 発話区切りが UX 上分かりやすい

## 8. API Surface

MVP では REST + WebSocket で十分。

### 8.1 REST

- `POST /session`
- `POST /draft/append`
- `POST /draft/remove-last`
- `POST /draft/remove/:id`
- `POST /draft/clear`
- `POST /discuss/send`
- `POST /implement/start`
- `POST /control/stop`
- `POST /control/approve`
- `POST /control/reject`

### 8.2 Streaming

- `GET /events` with SSE
  または
- `WS /ws`

WebSocket の方が双方向制御しやすいので本命。

## 9. Data Model

```ts
type DraftSegment = {
  id: string
  text: string
  createdAt: number
}

type DiscussViewState = {
  rawText: string
  firstVisibleLine: number
}

type AppSessionState = {
  sessionId: string
  mode: 'draft' | 'discuss' | 'implement'
  agentKind: AgentKind
  workspacePath: string
  draftSegments: DraftSegment[]
  conversationSummary: string
  discuss: DiscussViewState
  currentTask: string
  implementationStatus: string
  recentEvents: AgentEvent[]
}
```

### 9.1 Discuss Rendering Model

`Discuss` では `wrappedText` を state として保存しない。

保持するもの:

- `rawText`
- `firstVisibleLine`

描画時に行うこと:

1. 現在の眼鏡 UI 幅に応じて折り返す
2. `wrappedLines` を作る
3. `firstVisibleLine` から見える範囲だけ抜き出す
4. `TextContainerProperty.content` に改行付き文字列として渡す

イメージ:

```ts
const wrappedLines = wrapGlassText(rawText, width)
const visibleLines = wrappedLines.slice(firstVisibleLine, firstVisibleLine + pageSize)
const content = visibleLines.join('\n')
```

この方針により:

- レイアウト変更に強い
- フォント幅や container 幅の差分を吸収しやすい
- 再描画時の不整合を避けられる

## 10. Security Model

サーバー側で強く制御する。

必須:

- 認証
- user/session ごとの workspace 制限
- destructive action の approval
- audit log
- secret を音声入力経由で直接扱わせない

危険操作:

- `git push`
- `rm`
- `publish`
- secret file の読み書き

これらは必ず approval 経由にする。

## 11. MVP Scope

最初の実装範囲は絞るべき。

### Phase 1

- text input だけで discuss
- agent adapter 抽象
- discuss 全文表示

### Phase 2

- push-to-talk
- STT -> segment 化
- segment 編集

現在の最小実装:

- `bridge.audioControl(true/false)` による push-to-talk 開始/停止
- `audioEvent.audioPcm` の chunk 数集約
- standalone fallback では stop 時に local mock transcription を 1 segment に変換
- server 経由では SQLite に `task_segments` を保存し、`/__agent_terminal_api` で ingest する
- 実 STT サーバー接続は未実装

### Phase 3

- implement mode
- file-change / test status 表示
- interrupt / approval

現在の Codex 接続:

- server は `codex exec --json` を subprocess で起動する
- prompt は stdin で渡す
- `thread.started / turn.started / item.completed / turn.completed` を `AgentEvent` に正規化する
- 無限待機を避けるため `exec timeout` と `idle timeout` の二段 watchdog を入れる
- 現在の env:
  - `CODEX_MODEL`
  - `CODEX_EXEC_TIMEOUT_MS`
  - `CODEX_IDLE_TIMEOUT_MS`
  - `AGENT_TERMINAL_WORKSPACE_PATH`

### Phase 4

- companion web UI
- session resume
- multi-repo support

## 12. Recommended File Layout

```text
apps/agent_terminal/
  index.html
  package.json
  vite.config.ts
  app.json
  src/
    main.ts
    agent-app.ts
    voice.ts
    transport.ts
    state.ts
  server/
    package.json
    src/
      index.ts
      session-manager.ts
      draft-manager.ts
      stt.ts
      summarizer.ts
      agent-adapters/
        types.ts
        registry.ts
        codex.ts
        claude-code.ts
```

## 13. Design Decision Summary

重要な意思決定は以下。

1. app は terminal viewer ではなく `仕様会話 + 実装監視` app とする
2. 音声は push-to-talk
3. 入力は文単位 segment で保持する
4. 編集は segment 単位に限定する
5. agent は adapter 経由で抽象化する
6. `Discuss` は全文表示、`Implement` は summary 表示にする
7. 実行主体は server 側に置く

## 14. Next Step

次に作るべきもの:

1. `apps/agent_terminal` の skeleton
2. `server/src/agent-adapters/types.ts`
3. `server/src/agent-adapters/registry.ts`
4. `server/src/agent-adapters/codex.ts`
5. `server/src/agent-adapters/claude-code.ts`
6. Draft mode の最小 UI
