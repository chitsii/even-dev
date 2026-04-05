# Agent Terminal Private Build Checklist

`agent_terminal` を private build として Even Hub developer portal に上げる前のメモです。

## 安全方針

- 通常 build は remote gateway を使いません。
- remote gateway は `private build` 用の env ファイルを明示生成した時だけ有効です。
- remote gateway には API key を設定できます。
- app 側も `Gateway token` を保存して、その token を header で送ります。
- accidental publish を避けるため、`app.json` 本体には `network` permission を入れていません。
- remote gateway 用の `network` permission は `app.private.json` を生成するときだけ付与します。
- installed app で user-configurable gateway を許すため、private build の既定は `network.whitelist: []` です。

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
- `prepare-agent-terminal-private-build.mjs` の既定は `network.whitelist: []` です。
- fixed origin に縛りたいときだけ `--strict-network-whitelist` を付けて exact origin を入れます。

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
5. 現在の既定では `network.whitelist: []` を使う
6. 厳格に固定 origin へ縛る場合だけ `--strict-network-whitelist` を使う

## Tailscale と一緒に使う場合

前提:

- PC と iPhone が同じ tailnet に参加している
- iPhone 側の Tailscale が接続済み
- gateway server は PC 側で `0.0.0.0` bind か Tailscale IP bind

実運用イメージ:

1. PC 側で agent server を起動する
2. iPhone / Even app から Tailscale IP 経由でその `/api` を叩く
3. Web 設定画面の `Gateway` タブで URL と token を保存する

例:

- gateway URL: `http://100.80.199.121:8791/api`
- token: `devdev`

PC 側 server 起動例:

```bash
cd /c/Users/tishi/programming/eveng2/even-dev/services/codex-gateway
npm run dev
```

Web 側設定:

1. `設定`
2. `Gateway`
3. `Remote gateway URL` に `http://100.80.199.121:8791/api`
4. `Gateway token` に `devdev`
5. `Gateway保存`

補足:

- UI から local gateway に戻すボタンは置いていません
- URL を未設定のまま使うのは、browser / simulator のローカル開発時だけです
- 実機では Tailscale URL を入れて使う前提です
- `whitelist` を省略すると installed app で到達できなかったため、既定は `[]` を明示する方式にしています
