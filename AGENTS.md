# AGENTS.md

## Repo Overview

このリポジトリは Even G2 向け app を開発・起動・検証するための `even-dev` 開発ハブです。

概要と SDK/API の参照先:

- [docs/even-g2-sdk-reference.md](C:/Users/tishi/programming/eveng2/even-dev/docs/even-g2-sdk-reference.md)
- [docs/playwright-e2e.md](C:/Users/tishi/programming/eveng2/even-dev/docs/playwright-e2e.md)

最初に読む価値が高いファイル:

- [README.md](C:/Users/tishi/programming/eveng2/even-dev/README.md)
- [start-even.sh](C:/Users/tishi/programming/eveng2/even-dev/start-even.sh)
- [playwright.config.ts](C:/Users/tishi/programming/eveng2/even-dev/playwright.config.ts)

## Test Infrastructure

この repo の自動テスト基盤は `Vitest + Playwright` です。

構成:

- [vitest.config.ts](C:/Users/tishi/programming/eveng2/even-dev/vitest.config.ts)
  - unit test の対象を `apps/**/*.test.ts` に限定
- [apps/agent_terminal/server/src/agent-adapters/registry.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/agent-adapters/registry.test.ts)
  - agent adapter registry / mock runtime の unit test
- [apps/agent_terminal/server/src/agent-adapters/codex.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/agent-adapters/codex.test.ts)
  - Codex CLI JSONL parse
  - inactivity watchdog / execution timeout
- [apps/agent_terminal/server/src/storage.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/storage.test.ts)
  - SQLite task/segment 永続化
- [apps/agent_terminal/server/src/api.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/api.test.ts)
  - voice ingest API と transcription 保存
- [playwright.config.ts](C:/Users/tishi/programming/eveng2/even-dev/playwright.config.ts)
  - Playwright project 定義
  - app ごとの Vite web server 起動
- [e2e/support/fake-even-bridge.ts](C:/Users/tishi/programming/eveng2/even-dev/e2e/support/fake-even-bridge.ts)
  - fake Even native bridge
  - fake glasses event 注入 helper
- [scripts/playwright-webserver.mjs](C:/Users/tishi/programming/eveng2/even-dev/scripts/playwright-webserver.mjs)
  - built-in app 用 web server 起動ラッパー
  - app 側 `node_modules` が無い場合は `npm install` を補う

現在のサンプル E2E:

- [e2e/timer.spec.ts](C:/Users/tishi/programming/eveng2/even-dev/e2e/timer.spec.ts)
- [e2e/restapi.spec.ts](C:/Users/tishi/programming/eveng2/even-dev/e2e/restapi.spec.ts)
- [e2e/agent-terminal.spec.ts](C:/Users/tishi/programming/eveng2/even-dev/e2e/agent-terminal.spec.ts)
  - session lifecycle (`New Session`, `End Session`, recent session resume)
  - `Draft -> Discuss -> Implement`
  - `push-to-talk -> audio chunk capture -> draft segment`

現在のサンプル unit test:

- [apps/agent_terminal/server/src/agent-adapters/registry.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/agent-adapters/registry.test.ts)
- [apps/agent_terminal/src/voice.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/src/voice.test.ts)
  - voice session の chunk 集約と stop 時 transcription
- [apps/agent_terminal/server/src/storage.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/storage.test.ts)
- [apps/agent_terminal/server/src/api.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/api.test.ts)
- [apps/agent_terminal/server/src/agent-adapters/codex.test.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/agent_terminal/server/src/agent-adapters/codex.test.ts)

## How Tests Work

この E2E は本物の Even Hub Simulator 自動操作ではありません。

テスト方式:

1. Playwright が built-in app の Vite dev server を起動する
2. `page.addInitScript(...)` で `window.flutter_inappwebview.callHandler(...)` を fake 実装する
3. 必要に応じて `window._listenEvenAppMessage(...)` 経由で EvenHub event を擬似注入する
4. browser UI と bridge 呼び出しを同時に検証する

この方式で検証できるもの:

- browser UI の操作
- app 内 state 遷移
- bridge API の呼び出し
- fake glasses click / scroll / double click event

この方式で検証できないもの:

- 本物 simulator の UI 自動操作
- 実機や Even App 側そのものの保証

## Running Tests

初回セットアップ:

```bash
npm install
npm run test:e2e:install
```

通常実行:

```bash
npm run test:unit
npm run test:e2e
```

ブラウザを見ながら実行:

```bash
npm run test:e2e:headed
```

補足:

- `test:unit` は adapter や state helper の純粋ロジックを対象にする
- `test:e2e:install` は Playwright 用 Chromium を入れる
- `npm run test:e2e` 実行時、対象 app の依存が未インストールなら web server ラッパーが補完する

## Adding New Tests

新しい E2E を追加するときの方針:

1. まず built-in app 単位で追加する
2. 実 simulator 前提ではなく、browser + fake bridge で再現できる操作から書く
3. bridge の応答は `fake-even-bridge.ts` に寄せる
4. app 固有の network は `page.route(...)` で閉じる
5. DOM だけでなく、必要に応じて bridge call も assert する

新しい unit test を追加するときの方針:

1. `apps/**/*.test.ts` 配下に置く
2. browser UI ではなく純粋ロジックに絞る
3. agent 差分は adapter 単位で検証する
4. mock runtime の event 順序を固定し、上位層が依存できる契約にする

推奨対象:

- `clock`
- `quicktest`
- `base_app`

## Manual Verification

最終確認として、本物 simulator を使う手動確認は引き続き必要です。

代表例:

- `./start-even.sh timer`
- `./start-even.sh restapi`
- `APP_PATH=../my-app ./start-even.sh`

自動 E2E で app ロジックを先に潰し、最後に simulator で手動 smoke test を行う運用を推奨します。

## Glasses Event Rules

`agent_terminal` の眼鏡操作は、実機で何度も差分を踏んだ結果、次の扱い方が安定しています。今後 Even G2 の list / tap / double tap を実装するときは、まずこのルールを前提にしてください。

### Event decoding

- event type は container ごとの field だけでなく `jsonData` からも復元する  
  参照: [even-events.ts](C:/Users/tishi/programming/eveng2/even-dev/apps/_shared/even-events.ts)
- `currentSelectItemIndex=0` は SDK 側で欠落することがある  
  `listEvent.currentSelectItemIndex` が無い時も、`listEvent.jsonData` と root `jsonData` の両方から index を読む
- 実機の single tap / double tap は `eventType` が空の `sysEvent` や `textEvent` として来ることがある  
  `eventType` が明示されていないだけで無視しない

### Tap handling

- standby 画面
  - double tap で `sessions`
  - 実機では `DOUBLE_CLICK_EVENT` ではなく、短時間の 2 連 tap-like `sysEvent` になることがある  
    そのため rapid-tap fallback を入れる
- detail 画面
  - single tap で `actions`
  - 実機では `glass:route:event:type=undefined:route=detail` になることがある  
    `CLICK_EVENT` だけでなく、tap-like `sysEvent/textEvent` も `actions` オープン扱いにする
  - double tap は
    - 録音中なら録音停止
    - それ以外は `sessions` に戻る

### List container rules

- sessions / actions / review の list は `cc-g2` に寄せる
- `itemWidth` は `0` にする  
  固定幅を入れると実機で `invalid(1)` になりやすい
- `currentSelectedItem` は送らない  
  これも実機で `invalid(1)` の原因になった
- list 選択は `currentSelectItemIndex` が欠けても動くように
  - index
  - name
  - fallback first item
  の順で resolve する

### Page update rules

- list 画面への遷移で `rebuildPageContainer()` が `false` を返すことがある  
  その場合は `createStartUpPageContainer()` に fallback する
- 初回 startup payload は最小にする  
  複雑な payload を最初から送ると `invalid(1)` を踏みやすい
- text update は `textContainerUpgrade()` を優先し、失敗時だけ `rebuildPageContainer()` に戻す

### Debugging rules

- 実機 event の一次確認は `%TEMP%\\even-dev\\agent_terminal\\debug.log`
- 重要ログ:
  - `bridge:event:sys:...`
  - `glass:route:event:type=...:route=...`
  - `glass:standby:open-sessions:...`
  - `glass:detail:open-actions:...`
  - `glass:create:*`
  - `glass:rebuild:*`
- 「tap が効かない」時は、まず
  1. event が届いているか
  2. route 判定を通ったか
  3. page rebuild/create が失敗していないか
  の順で切る

### Test expectations

- Playwright の fake bridge では本物実機を完全には再現できない  
  ただし、次の回帰は最低限維持する
  - system double-click で standby から sessions
  - rapid empty system events で standby から sessions
  - detail の tap-like route event で actions
  - list rebuild fail 時の create fallback
- 眼鏡 event 周りを触ったら、少なくとも [agent-terminal.spec.ts](C:/Users/tishi/programming/eveng2/even-dev/e2e/agent-terminal.spec.ts) を更新して回帰を固定する
