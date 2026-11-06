# 旧URLで新アプリを公開

- 受付: https://koken-web.github.io/qr-system/
- 管理: https://koken-web.github.io/qr-system/control/

## オフライン準備

https://koken-web.github.io/qr-system/offline.html をサイトに接続できる回線で開き、「受付・管理の画面を保存する」を押す。各アプリの画面・音声・画像・分割JavaScriptを、アプリごとのService Workerに保存する。保存済みの起動画面は通信を待たずに返すため、Wi-Fi接続中でもGitHub Pagesに接続できない状況で起動できる。

画面の保存と、端末承認・イベントデータ保存は別である。使用するブラウザまたはホーム画面アプリでオンラインの端末登録・承認と当日イベントの読込を済ませ、Wi-Fiを切った状態で再起動を確認する。未接続の端末へアプリを初回配信する機能や、学校のURL制限を変更する機能ではない。Firebaseへの書込・権限判定・同期処理は変更しない。

`deployment/offline/service-worker.js` は公開処理で各URL向けに生成する。バージョンは保存対象の内容から算出し、全ファイルの保存に成功するまで新しいWorkerを有効にしない。失敗した更新は以前の正常なWorkerを残す。受付Workerは `control/` を処理しない。`node --test deployment/offline/service-worker.test.mjs` でオフライン・通信停止・403・保存失敗・アプリ間の分離を検証する。

元のソースとFirestoreルールを残し、Pagesの公開ワークフローだけを新アプリへ切り替える。新アプリのレビュー済みcommitをcheckoutし、上記baseパスでビルドする。接続先は現在の新アプリと同じ qr-ticket-system-5ba69。firebase-client.jsonは配信中のWeb SDKに含まれている公開クライアント設定であり、サービスアカウントや管理キーを含まない。

この変更では旧Firebaseプロジェクト・保存済みIndexedDB・端末内の旧受付履歴を削除/変換しない。旧URL上では新プロジェクトの端末登録・承認とイベントのオフライン準備を行う。現在の新URL側の承認済み管理端末から新しい登録申請を承認できる。旧アプリのイベントや未同期履歴が新アプリへ自動的に移行するわけではない。

PWAのstart_url/scopeを維持し、受付Workerがcontrol/を横取りしない版を使う。オンラインで開き直して新Workerとデータの保存を終えてからオフライン運用する。

今後の更新はdeploy.ymlのsource refをレビュー済みの新しいcommitへ進めてこのリポジトリのmainへ反映する。元の公開状態へ戻す場合はこの切り替えcommitをrevertし、旧ワークフローで再公開する。Firestoreルールの公開ワークフローは変更しない。
