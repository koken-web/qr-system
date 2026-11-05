# 旧URLで新アプリを公開

- 受付: https://koken-web.github.io/qr-system/
- 管理: https://koken-web.github.io/qr-system/control/

元のソースとFirestoreルールを残し、Pagesの公開ワークフローだけを新アプリへ切り替える。新アプリのレビュー済みcommitをcheckoutし、上記baseパスでビルドする。接続先は現在の新アプリと同じ qr-ticket-system-5ba69。firebase-client.jsonは配信中のWeb SDKに含まれている公開クライアント設定であり、サービスアカウントや管理キーを含まない。

この変更では旧Firebaseプロジェクト・保存済みIndexedDB・端末内の旧受付履歴を削除/変換しない。旧URL上では新プロジェクトの端末登録・承認とイベントのオフライン準備を行う。現在の新URL側の承認済み管理端末から新しい登録申請を承認できる。旧アプリのイベントや未同期履歴が新アプリへ自動的に移行するわけではない。

PWAのstart_url/scopeを維持し、受付Workerがcontrol/を横取りしない版を使う。オンラインで開き直して新Workerとデータの保存を終えてからオフライン運用する。

今後の更新はdeploy.ymlのsource refをレビュー済みの新しいcommitへ進めてこのリポジトリのmainへ反映する。元の公開状態へ戻す場合はこの切り替えcommitをrevertし、旧ワークフローで再公開する。Firestoreルールの公開ワークフローは変更しない。
