# Codex Gateway Directory Split

`agent_terminal` を Even G2 client に寄せ、PC 側の Codex 常設機能は別 service に分ける案です。

## 役割分離

- `apps/agent_terminal`
  - Even G2 app
  - Web companion UI
  - remote gateway client
- `services/codex-gateway`
  - Codex CLI / `codex app-server` を管理
  - thread / turn API を HTTP/SSE で公開
  - Even App `Custom AI Agent` 向け `/v1/chat/completions`
  - token 認証
  - debug log

## 追加した standalone service

- [services/codex-gateway/package.json](/C:/Users/tishi/programming/eveng2/even-dev/services/codex-gateway/package.json)
- [services/codex-gateway/src/index.ts](/C:/Users/tishi/programming/eveng2/even-dev/services/codex-gateway/src/index.ts)
- [services/codex-gateway/src/api.ts](/C:/Users/tishi/programming/eveng2/even-dev/services/codex-gateway/src/api.ts)
- [services/codex-gateway/src/codex-thread-backend.ts](/C:/Users/tishi/programming/eveng2/even-dev/services/codex-gateway/src/codex-thread-backend.ts)
- [services/codex-gateway/src/codex-app-server-client.ts](/C:/Users/tishi/programming/eveng2/even-dev/services/codex-gateway/src/codex-app-server-client.ts)

## 実運用の想定

1. PC で `services/codex-gateway` を常駐起動
2. Tailscale 内で `http://<tailscale-ip>:8788/api` を公開
3. `agent_terminal` はその URL を `Gateway` 設定で使う
4. Even App `Custom AI Agent` は `http://<tailscale-ip>:8788/v1/chat/completions` を使う

## 起動例

PowerShell:

```powershell
$env:HOST='0.0.0.0'
$env:PORT='8788'
$env:CODEX_GATEWAY_API_KEY='devdev'
$env:CODEX_GATEWAY_VOICE_ENTRY_TOKEN='devvoice'
$env:CODEX_GATEWAY_WORKSPACE_PATH='C:\Users\tishi\programming\eveng2\even-dev'
cd services/codex-gateway
node src/index.ts
```

## HTTP API

- `GET /api/status`
- `GET /api/threads`
- `POST /api/threads`
- `GET /api/threads/:id`
- `POST /api/threads/:id/resume`
- `POST /api/threads/:id/turns`
- `POST /api/threads/:id/interrupt`
- `GET /api/threads/:id/runtime`
- `GET /api/threads/:id/events`
- `POST /v1/chat/completions`

## Voice Entry の挙動

`/v1/chat/completions` は Even App `Custom AI Agent` からの入力を受けます。

- 通常の発話
  - 新規 session を作成し、そのまま Codex に送る
- `continue`, `resume`, `続き`, `再開`
  - 直近 session を再開
- `continue fix tests`
  - 直近 session を再開し、残りを Codex に送る

## 今回の位置づけ

この repo 内に置いてはいますが、`agent_terminal/server` とは別です。  
実際の運用ではこの `services/codex-gateway` だけを外へ切り出しても成立する形にしてあります。
