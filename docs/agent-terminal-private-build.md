# Agent Terminal Private Build Checklist

`agent_terminal` を private build として Even Hub developer portal に上げる前のメモです。

## 安全方針

- 通常 build は remote gateway を使いません。
- remote gateway は `private build` 用の env ファイルを明示生成した時だけ有効です。
- remote gateway には API key を設定できます。
- app 側も `Gateway token` を保存して、その token を header で送ります。
- accidental publish を避けるため、`app.json` 本体には `network` permission を入れていません。
- remote gateway 用の `network` permission は `app.private.json` を生成するときだけ付与します。

## package 前の確認

1. `app.json` が current docs 形式か
2. `dist/index.html` が build 出力にあるか
3. app 名が 20 文字以下か
4. `package_id` が upload 先で問題ない形式か
5. マイクを使うなら `g2-microphone` permission があるか

## private build 生成

manifest と private-build 用 env は script で生成します。

```bash
node scripts/prepare-agent-terminal-private-build.mjs --package-id com.chitsii.agentterminal --gateway-url https://your-tailnet-host.ts.net/api --gateway-token devdev
cmd /c npm --prefix apps/agent_terminal run build:private
cmd /c npx @evenrealities/evenhub-cli pack apps/agent_terminal/app.private.json apps/agent_terminal/dist -o apps/agent_terminal/agent-terminal-private.ehpk
```

補足:

- `https://your-tailnet-host.ts.net/api` は Tailscale 側で公開した実 URL に置き換えてください。
- `devdev` はテスト専用としては使えますが、外部公開前にはランダムな長い token に変えた方が安全です。

生成物:

- [agent-terminal-private.ehpk](/C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/agent-terminal-private.ehpk)
- [app.private.json](/C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/app.private.json)
- [.env.private-build.local](/C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/.env.private-build.local)

## portal upload 前提の実機テスト導線

Discord と公式 docs から読み取れる現状の想定導線:

1. `preview.evenhub.evenrealities.com` の developer portal に入る
2. `.ehpk` を private build として upload する
3. `testing group` に自分の test user email を追加する
4. iPhone の beta Even Realities app で反映を待つ
5. `Even Hub` 右上の glasses icon から `My plugins` を開く
6. 自分の名前を選び `Prototype mode` に入る
7. 実機テストする

## remote gateway 側の前提

1. HTTPS で公開する
2. `/api` 配下で current server routes を公開する
3. `AGENT_TERMINAL_API_KEY` を設定する
4. Codex と SQLite を server 側に置く
5. private build の `network` whitelist にその origin を入れる
