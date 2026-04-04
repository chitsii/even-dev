# Even G2 SDK / even-dev Reference

この文書は、このリポジトリの実装を読んで整理した Even G2 アプリ開発用の参照メモです。対象は `even-dev` ランチャー、内蔵サンプルアプリ、インストール済み SDK `@evenrealities/even_hub_sdk` です。

確認元:

- `README.md`
- `start-even.sh`
- `vite.config.ts`
- `vite-plugins/*`
- `apps/_shared/*`
- `apps/base_app/*`
- `apps/clock/*`
- `apps/timer/*`
- `apps/restapi/*`
- `apps/quicktest/*`
- `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
- `node_modules/@evenrealities/even_hub_sdk/README.md`

インストール済み SDK バージョン:

- `@evenrealities/even_hub_sdk@0.0.9`

## 1. リポジトリの役割

このリポジトリは「Even G2 アプリそのもの」ではなく、Even G2 向け Web アプリを開発・起動・検証するための開発ハブです。

主な責務:

1. アプリ選択
2. アプリ依存関係のインストール
3. 選択アプリの `index.html` を root Vite から配信
4. 必要に応じて app 専用 Vite plugin や `server/` を起動
5. Even Hub Simulator に対象 URL を渡して起動
6. `@evenrealities/even_hub_sdk` を介した WebView <-> Even Hub の橋渡し

## 2. 全体アーキテクチャ

実行時の流れは以下です。

1. `./start-even.sh` が built-in app (`apps/*`) と `apps.json` の registry app を列挙する
2. 選択した app を `APP_NAME` / `APP_PATH` として root Vite に渡す
3. root の [`vite.config.ts`](../vite.config.ts) が選択 app の `index.html` を配信する
4. root Vite が常設 plugin と選択 app の plugin をロードする
5. simulator がその Vite URL を開く
6. app の `src/main.ts` が起動し、`waitForEvenAppBridge()` で bridge を待つ
7. app が `createStartUpPageContainer(...)` で眼鏡 UI を初期描画し、その後 `rebuildPageContainer(...)` や `textContainerUpgrade(...)` で更新する
8. 眼鏡操作は `onEvenHubEvent(...)` で Web 側へ戻る

重要な構成要素:

- `start-even.sh`
  - 開発ランチャー本体
  - `--update`, `--devenv-update`, `--web-only`, `--sim-only`, `--evenhub-cli` を提供
- `vite.config.ts`
  - 選択 app の HTML を配信する root Vite
- `vite-plugins/`
  - app 起動時の補助 plugin
- `apps/*`
  - built-in サンプル app
- `apps/_shared/`
  - サンプル app 共通 helper
- `scripts/pack-app.sh`
  - built-in app を `evenhub-cli pack` で `.ehpk` 化

## 3. App 作成時の最小構成

このリポジトリ内の built-in app と README から見える最小構成は以下です。

```text
my-app/
  index.html
  package.json
  vite.config.ts
  app.json
  src/
    main.ts
```

各ファイルの役割:

- `index.html`
  - 通常の Vite エントリ
- `src/main.ts`
  - Web UI 初期化
  - bridge 接続
  - 眼鏡向け container 生成と更新
- `vite.config.ts`
  - 単体起動時の dev server 設定
  - built-in app は `apps/_shared/standalone-vite.ts` を共通利用
- `app.json`
  - Even Hub 配布メタデータ
  - `package_id`, `edition`, `entrypoint`, `permissions` などを持つ
- `package.json`
  - 依存関係と `dev/build/preview` script

実際の built-in app は次の共通形です。

```ts
import { defineConfig } from 'vite'
import { createStandaloneViteConfig } from '../_shared/standalone-vite'

export default defineConfig(createStandaloneViteConfig(import.meta.url, 5175))
```

つまり built-in app は「root Vite からの起動」にも「app 単体の `npm run dev`」にも対応しています。

## 4. even-dev での app 読み込み方式

アプリの取り込み元は 3 種類あります。

### 4.1 Built-in app

- `apps/base_app`
- `apps/clock`
- `apps/timer`
- `apps/restapi`
- `apps/quicktest`

特徴:

- この repo 内に同居
- `./start-even.sh` からすぐ選択できる
- `scripts/pack-app.sh <app>` で pack できる

### 4.2 Registry app

`apps.json` に登録された外部 app です。

- Git URL の場合は `.apps-cache/<app-name>` に clone
- ローカル path の場合は repo root から相対解決

### 4.3 APP_PATH 直接指定

一時的なローカル app を登録なしで起動できます。

```bash
APP_PATH=../my-app ./start-even.sh
```

`APP_NAME` を省略するとディレクトリ名が app 名になります。

## 5. app に追加できる拡張ポイント

### 5.1 `vite-plugin.ts`

選択 app に `vite-plugin.ts` があれば root Vite が自動ロードします。`apps/restapi/vite-plugin.ts` はその実例で、CORS 回避用 proxy を追加しています。

使いどころ:

- 外部 API への proxy
- 静的 asset 配信
- host 側ブラウザ連携の補助 route

### 5.2 `server/`

選択 app 配下に `server/package.json` があれば `vite-plugins/app-server.ts` が `npx tsx src/index.ts` を起動します。

使いどころ:

- API secret をブラウザに置きたくない場合
- 外部サービスの proxy / BFF
- websocket / SSE の補助処理

### 5.3 root 側 plugin

`vite-plugins/<app-name>-plugin.ts` も自動解決されます。`start-even.sh` は built-in app や cached app に対して `vite-plugin.ts` の symlink を同期します。

## 6. app.json で持つべき情報

各 built-in app の `app.json` はほぼ共通で、以下を持ちます。

```json
{
  "package_id": "com.example.myapp",
  "edition": "202601",
  "name": "My App",
  "version": "0.1.0",
  "min_app_version": "0.1.0",
  "tagline": "Short summary",
  "description": "Longer description",
  "author": "Your Name",
  "entrypoint": "index.html",
  "permissions": {
    "network": ["evenhub.evenrealities.com"],
    "fs": ["./assets"]
  }
}
```

補足:

- `entrypoint` は通常 `index.html`
- `permissions` は app に応じて追加
- pack 時は `evenhub-cli pack app.json dist` が使われる

## 7. 実装パターン別サンプル

この repo の built-in app は API の使い方が分かりやすく分かれています。

| app | 何を見ると良いか | 主な API |
| --- | --- | --- |
| `base_app` | 最低限のテンプレート、bridge なしの mock fallback、`even-better-sdk` 使用例 | `EvenBetterSdk`, event handling |
| `clock` | 初回描画後に `textContainerUpgrade` で軽量更新 | `createStartUpPageContainer`, `rebuildPageContainer`, `textContainerUpgrade` |
| `timer` | list UI と眼鏡操作イベントの処理 | `ListContainerProperty`, `onEvenHubEvent` |
| `restapi` | 複数 list、focus 切替、response page 再描画、app 専用 Vite plugin | `RebuildPageContainer`, `TextContainerUpgrade`, custom `vite-plugin.ts` |
| `quicktest` | 生成済み container をその場で差し替えて検証 | `CreateStartUpPageContainer`, `RebuildPageContainer`, image/list/text 混在 |

設計上の示唆:

- 単純な時計やステータス表示は `textContainerUpgrade` を優先
- 画面構造自体が変わるときは `rebuildPageContainer`
- 眼鏡入力は `onEvenHubEvent` に集約
- ブラウザ UI と眼鏡 UI の両方を持つと開発が楽
- bridge が無いときの mock mode を持つと単体検証しやすい

## 8. SDK の中心オブジェクト

最初に使うのは `EvenAppBridge` です。通常は `waitForEvenAppBridge()` を使います。

```ts
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()
```

これ以降の API はほぼすべて `bridge` 経由です。

## 9. Bridge API 一覧

以下は `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` にあるメソッド一覧です。

### 9.1 基本情報系

#### `getUserInfo(): Promise<UserInfo>`

ユーザー情報を取得します。

```ts
const user = await bridge.getUserInfo()
console.log(user.uid, user.name, user.country)
```

#### `getDeviceInfo(): Promise<DeviceInfo | null>`

接続デバイス情報を取得します。

```ts
const device = await bridge.getDeviceInfo()
console.log(device?.model, device?.sn, device?.status.connectType)
```

`DeviceInfo.status` には以下が入ります。

- `connectType`
- `isWearing`
- `batteryLevel`
- `isCharging`
- `isInCase`

### 9.2 Local storage 系

#### `setLocalStorage(key: string, value: string): Promise<boolean>`

```ts
await bridge.setLocalStorage('theme', 'dark')
```

#### `getLocalStorage(key: string): Promise<string>`

```ts
const theme = await bridge.getLocalStorage('theme')
```

注意:

- この repo の built-in app は主に `window.localStorage` を使っている
- Even 側永続化が必要なら bridge storage も検討できる

### 9.3 ページ生成・更新系

#### `createStartUpPageContainer(container)`

眼鏡 UI の最初の描画です。custom app 起動後、最初にこれを呼ぶ前提です。

返り値:

- `StartUpPageCreateResult.success`
- `StartUpPageCreateResult.invalid`
- `StartUpPageCreateResult.oversize`
- `StartUpPageCreateResult.outOfMemory`

```ts
await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 1,
  textObject: [
    new TextContainerProperty({
      containerID: 1,
      containerName: 'title',
      content: 'Hello Even G2',
      xPosition: 8,
      yPosition: 8,
      width: 300,
      height: 40,
      isEventCapture: 0,
    }),
  ],
}))
```

#### `rebuildPageContainer(container)`

ページ構造をまるごと差し替えます。text/list/image の構成変更時に使います。

```ts
await bridge.rebuildPageContainer(new RebuildPageContainer({
  containerTotalNum: 2,
  textObject: [...],
  listObject: [...],
}))
```

#### `textContainerUpgrade(container)`

既存 text container の本文だけ軽く更新します。`clock` と `timer` がこのパターンです。

```ts
await bridge.textContainerUpgrade(new TextContainerUpgrade({
  containerID: 1,
  containerName: 'clock-time',
  contentOffset: 0,
  contentLength: 16,
  content: '12:34:56',
}))
```

向いている用途:

- 時計
- ステータス文言
- カウンタ
- プログレス文字列

向いていない用途:

- container の位置変更
- list item の入れ替え
- 画面全体の mode 切替

#### `updateImageRawData(data)`

image container の実データを送ります。image は container 作成時点ではプレースホルダで、別途この API が必要です。

```ts
await bridge.updateImageRawData(new ImageRawDataUpdate({
  containerID: 10,
  containerName: 'logo',
  imageData: uint8ArrayOrNumberArray,
}))
```

注意:

- 画像送信は並列で投げない方が良い
- 画像あり UI は `createStartUpPageContainer` / `rebuildPageContainer` のあとに送る

#### `shutDownPageContainer(exitMode?: number)`

ページ終了を要求します。

- `0`: 即時終了
- `1`: foreground layer に遷移してユーザー確認待ち

### 9.4 センサー / 音声系

#### `audioControl(isOpen: boolean)`

マイク入力の開始・停止です。音声データは `onEvenHubEvent` の `audioEvent` で届きます。

```ts
await bridge.audioControl(true)

const unsubscribe = bridge.onEvenHubEvent((event) => {
  if (event.audioEvent) {
    console.log(event.audioEvent.audioPcm)
  }
})
```

#### `imuControl(isOpen: boolean, reportFrq?: ImuReportPace)`

IMU ストリームの開始・停止です。データは `sysEvent.imuData` に来ます。

```ts
await bridge.imuControl(true, ImuReportPace.P100)

bridge.onEvenHubEvent((event) => {
  if (event.sysEvent?.eventType === OsEventTypeList.IMU_DATA_REPORT) {
    console.log(event.sysEvent.imuData?.x, event.sysEvent.imuData?.y, event.sysEvent.imuData?.z)
  }
})
```

### 9.5 イベント購読系

#### `onLaunchSource(callback)`

起動元が app menu か glasses menu かを受け取ります。

```ts
bridge.onLaunchSource((source) => {
  console.log(source) // 'appMenu' | 'glassesMenu'
})
```

#### `onDeviceStatusChanged(callback)`

接続状態や battery を監視します。

```ts
bridge.onDeviceStatusChanged((status) => {
  console.log(status.connectType, status.batteryLevel)
})
```

#### `onEvenHubEvent(callback)`

眼鏡 UI からの入力と runtime event の本体です。

```ts
bridge.onEvenHubEvent((event) => {
  if (event.listEvent) {
    console.log(event.listEvent.currentSelectItemIndex)
  }
  if (event.textEvent) {
    console.log(event.textEvent.containerName)
  }
  if (event.sysEvent) {
    console.log(event.sysEvent.eventType)
  }
})
```

## 10. Container モデル一覧

アプリを作るときに実際によく触る型です。

### 10.1 `CreateStartUpPageContainer`

主要 field:

- `containerTotalNum`
- `currentSelectedItem?`
- `textObject?: TextContainerProperty[]`
- `listObject?: ListContainerProperty[]`
- `imageObject?: ImageContainerProperty[]`

用途:

- 最初のページ描画

### 10.2 `RebuildPageContainer`

`CreateStartUpPageContainer` とほぼ同構造です。

用途:

- 画面構成の再生成
- list / image / text の入れ替え

### 10.3 `TextContainerProperty`

主要 field:

- `containerID`
- `containerName`
- `content`
- `xPosition`
- `yPosition`
- `width`
- `height`
- `isEventCapture`
- `borderWidth`
- `borderColor`
- `borderRadius`
- `paddingLength`

### 10.4 `ListItemContainerProperty`

主要 field:

- `itemCount`
- `itemWidth`
- `isItemSelectBorderEn`
- `itemName`

### 10.5 `ListContainerProperty`

主要 field:

- `containerID`
- `containerName`
- `itemContainer`
- `xPosition`
- `yPosition`
- `width`
- `height`
- `isEventCapture`

ポイント:

- 眼鏡の操作イベントを取りたい list は `isEventCapture: 1`
- 選択枠が必要なら `itemContainer.isItemSelectBorderEn: 1`

### 10.6 `ImageContainerProperty`

主要 field:

- `containerID`
- `containerName`
- `xPosition`
- `yPosition`
- `width`
- `height`

### 10.7 `TextContainerUpgrade`

主要 field:

- `containerID`
- `containerName`
- `contentOffset`
- `contentLength`
- `content`

### 10.8 `ImageRawDataUpdate`

主要 field:

- `containerID`
- `containerName`
- `imageData`

`imageData` は次を受け取れます。

- `number[]`
- `string`
- `Uint8Array`
- `ArrayBuffer`

## 11. Event モデル一覧

### 11.1 `EvenHubEvent`

payload は次のどれかです。

- `listEvent?: List_ItemEvent`
- `textEvent?: Text_ItemEvent`
- `sysEvent?: Sys_ItemEvent`
- `audioEvent?: { audioPcm: Uint8Array }`
- `jsonData?: Record<string, any>`

### 11.2 `List_ItemEvent`

よく使う field:

- `containerID`
- `containerName`
- `currentSelectItemName`
- `currentSelectItemIndex`
- `eventType`

### 11.3 `Text_ItemEvent`

よく使う field:

- `containerID`
- `containerName`
- `eventType`

### 11.4 `Sys_ItemEvent`

よく使う field:

- `eventType`
- `eventSource`
- `imuData`
- `systemExitReasonCode`

### 11.5 `OsEventTypeList`

SDK に定義されている主要 event type:

- `CLICK_EVENT`
- `SCROLL_TOP_EVENT`
- `SCROLL_BOTTOM_EVENT`
- `DOUBLE_CLICK_EVENT`
- `FOREGROUND_ENTER_EVENT`
- `FOREGROUND_EXIT_EVENT`
- `ABNORMAL_EXIT_EVENT`
- `SYSTEM_EXIT_EVENT`
- `IMU_DATA_REPORT`

この repo の sample app が主に使っているのは以下です。

- `CLICK_EVENT`
- `SCROLL_TOP_EVENT`
- `SCROLL_BOTTOM_EVENT`
- `DOUBLE_CLICK_EVENT`

補足:

- simulator 由来の event は index/name が欠けることがあり、`apps/_shared/even-events.ts` や各 sample app で fallback 補正を入れている
- `timer` と `restapi` は特にこの補正ロジックが参考になる

## 12. 実際の起動コードの基本形

この repo から抽出できる最小パターンは次の形です。

```ts
import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerProperty,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()

bridge.onEvenHubEvent((event) => {
  const type = event.listEvent?.eventType ?? event.textEvent?.eventType ?? event.sysEvent?.eventType
  if (type === OsEventTypeList.CLICK_EVENT) {
    console.log('click')
  }
})

await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 1,
  textObject: [
    new TextContainerProperty({
      containerID: 1,
      containerName: 'hello',
      content: 'Hello',
      xPosition: 8,
      yPosition: 8,
      width: 120,
      height: 32,
      isEventCapture: 0,
    }),
  ],
}))
```

## 13. 実装時の推奨パターン

この repo のサンプルから見て、次の方針が実用的です。

1. 接続は `waitForEvenAppBridge()` に集約する
2. 初回描画は `createStartUpPageContainer()`、以後は軽い更新なら `textContainerUpgrade()`、構造変更なら `rebuildPageContainer()`
3. 眼鏡入力は `onEvenHubEvent()` を 1 箇所に集めて mode ごとに dispatch する
4. ブラウザ UI 側にも同じ state を持ち、眼鏡 UI と同期する
5. bridge が無いときの mock mode を作る
6. API 呼び出しや CORS 回避が必要なら `vite-plugin.ts` または `server/` を使う
7. list event は simulator 差異を考慮して index/name 欠落時の fallback を入れる

## 14. 開発・ビルド・配布

### 14.1 開発起動

```bash
./start-even.sh
./start-even.sh timer
APP_PATH=../my-app ./start-even.sh
```

### 14.2 app 単体起動

```bash
cd apps/timer
npm run dev
```

### 14.3 pack

```bash
./scripts/pack-app.sh timer
```

内部的には以下と同じです。

```bash
cd apps/timer
npm run build
npx @evenrealities/evenhub-cli pack app.json dist
```

## 15. 先に読むべきファイル

今後の参照価値が高い順で挙げると次です。

1. `apps/timer/src/timer-controller.ts`
   - list event と page rebuild の実戦例
2. `apps/restapi/src/restapi-app.ts`
   - 複数 list、focus 切替、長文 response handling
3. `apps/clock/src/clock-app.ts`
   - `textContainerUpgrade` の最小実例
4. `apps/quicktest/src/quicktest-app.ts`
   - generated container の差し替え検証
5. `vite.config.ts`
   - even-dev が app をどう配信しているか
6. `vite-plugins/index.ts`
   - plugin 自動発見の仕組み
7. `start-even.sh`
   - 実行モード全体
8. `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
   - API の一次情報

## 16. まとめ

Even G2 app 開発の実体は「Vite で動く普通の Web app に、Even bridge API を載せる」ことです。重要なのは framework ではなく以下の 3 点です。

1. `createStartUpPageContainer` / `rebuildPageContainer` / `textContainerUpgrade` の使い分け
2. `onEvenHubEvent` を中心にした眼鏡入力処理
3. `even-dev` の app 読み込み経路と plugin/server 拡張点の理解

この repo では `clock`, `timer`, `restapi`, `quicktest` を順に読むと、ほぼ必要な実装パターンが揃います。
