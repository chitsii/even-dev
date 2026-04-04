# Playwright E2E Setup

この repo には本物の Even Hub Simulator を直接操作する自動 E2E はありません。代わりに、Playwright でブラウザを開き、Even native bridge を fake 実装で差し込む統合 E2E を追加しています。

対象:

- `apps/timer`
- `apps/restapi`

仕組み:

1. Playwright が app の Vite dev server を起動する
2. `page.addInitScript(...)` で `window.flutter_inappwebview.callHandler(...)` を fake 実装する
3. テストから `window._listenEvenAppMessage(...)` 経由で EvenHub event を擬似注入する
4. ブラウザ UI と bridge 呼び出しを同時に検証する

## 初回セットアップ

```bash
npm install
npm run test:e2e:install
```

`test:e2e:install` は Chromium を入れます。

各 built-in app の `node_modules` が未作成でも、Playwright の web server ラッパーが `apps/timer` と `apps/restapi` に対して `npm install` を自動実行します。

## 実行

```bash
npm run test:e2e
```

headed で見る場合:

```bash
npm run test:e2e:headed
```

## ファイル

- `playwright.config.ts`
  - Vite web server 起動
  - app ごとの project 定義
- `e2e/support/fake-even-bridge.ts`
  - fake bridge
  - fake glasses event 注入 helper
- `e2e/timer.spec.ts`
  - timer app の browser + bridge 統合 E2E
- `e2e/restapi.spec.ts`
  - restapi app の browser + bridge 統合 E2E

## できること / できないこと

できること:

- browser UI 自動操作
- bridge API 呼び出し検証
- fake glasses click / scroll / double click の注入
- app 内 state 遷移の検証

できないこと:

- 本物 simulator の UI 操作
- 実機や Even App 側の挙動そのものの保証

つまり、この E2E は「app が Even bridge を正しく使っているか」を高速に検証するためのものです。最終確認としての simulator 手動テストは引き続き必要です。
