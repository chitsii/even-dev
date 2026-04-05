# Agent Terminal Real Codex Manual Test

`agent_terminal` は `mock` と `codex app-server` の 2 経路で動きます。  
real Codex の手動結合テストでは、`AGENT_TERMINAL_USE_MOCK_AGENT` を設定しません。

Even App 側 STT を使いたい場合は、`services/codex-gateway` の
`/v1/chat/completions` を Even App `Custom AI Agent` に設定します。

## 事前条件

- `codex` CLI がこの PC で動くこと
- `codex login` 済みであること
- テストしたい workspace が `even-dev` repo でよければ追加設定不要

## 1. 既存プロセスを落とす

PowerShell:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 5180,8788 } |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

## 2. Web app と agent server を起動

PowerShell:

```powershell
bash -lc "PORT=5180 AGENT_TERMINAL_SERVER_PORT=8788 ./start-even.sh agent_terminal --web-only"
```

重要:

- `AGENT_TERMINAL_USE_MOCK_AGENT=1` を付けない
- これで root Vite は `http://127.0.0.1:5180`
- app server は `127.0.0.1:8788`
- URL 未設定のとき、browser / simulator はこのローカル server をそのまま使います

## 3. Simulator を起動

別ターミナル:

```powershell
bash -lc "URL=http://127.0.0.1:5180 ./start-even.sh --sim-only"
```

## 4. Runtime タブで real backend を確認

Web 側:

1. `設定`
2. `Runtime`

ここで次を確認します。

- `Backend: codex`
- `Workspace: ...even-dev`

`Backend: mock` なら起動方法が間違っています。

## Tailscale で実機につなぐ場合

1. PC と iPhone を同じ tailnet に入れる
2. PC 側 server を Tailscale から届く bind で起動する
3. Web 側 `設定 -> Gateway` で Tailscale URL を保存する

例:

- URL: `http://100.80.199.121:8788/api`
- token: `devdev`

補足:

- UI に「組み込みGatewayへ戻す」ボタンはありません
- 実機では Tailscale URL を入れて使う前提です

## Even App STT の Voice Entry

別経路で Even App の STT を使うには、PC 側で `services/codex-gateway` を起動します。

```powershell
cd services/codex-gateway
$env:HOST='0.0.0.0'
$env:PORT='8791'
$env:CODEX_GATEWAY_API_KEY='devdev'
$env:CODEX_GATEWAY_VOICE_ENTRY_TOKEN='devvoice'
$env:CODEX_GATEWAY_WORKSPACE_PATH='C:\Users\tishi\programming\eveng2\even-dev'
node src/index.ts
```

Even App の `Conversate -> Custom AI Agent` に次を設定します。

- Endpoint URL: `http://100.80.199.121:8791/v1/chat/completions`
- Bearer token: `devvoice`

最小テスト:

1. Even App 側で `Reply with exactly: VOICE_ENTRY_OK` と話す
2. `agent_terminal` で `セッション一覧` を更新
3. 新しく作られた session を開く
4. 会話履歴に `VOICE_ENTRY_OK` が出ることを確認する

再開テスト:

- `continue`
  - 直近 session を再開
- `continue fix tests`
  - 直近 session を再開し、そのまま `fix tests` を送る

## 5. 最小の実結合テスト

1. `新規セッション`
2. 入力欄に次を入れる

```text
Reply with exactly: REAL_CODEX_OK
```

3. `送信`

期待結果:

- Web の会話履歴に `REAL_CODEX_OK`
- Runtime に `Status: completed`
- Debug に `thread:event:message-delta` または `thread:event:message-completed`

## 6. 止めるテスト

次のような長めの指示を送ります。

```text
Think step by step about five alternative designs for an agent dashboard and explain each in detail before choosing one.
```

送信直後に:

- `停止` が表示される
- `停止` を押す

期待結果:

- Runtime が `interrupted` または `idle`
- Debug に `turn-completed:interrupted` 相当のログ

## 7. 失敗時の切り分け

- `Backend: mock`
  - 起動コマンドに mock env が残っています
- `Backend: unavailable`
  - app server に接続できていません
- `Waiting for agent response...` が長い
  - Runtime タブで `Backend` が `codex` か確認
  - `codex login` 状態を確認
  - Debug の末尾に `thread:event:*` が流れているか確認
- ブラウザが真っ白
  - 古い Vite/server/simulator が残っている可能性が高いので、先にプロセスを落としてから再起動
