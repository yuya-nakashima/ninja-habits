# Proposals

このファイルは、作業中に出た提案や検討メモを残すためのログです。

## 2026-06-14

### Cognito 実接続（T-029）

- 決定: API へ送るトークンは **ID トークン**（アクセストークンは email を持たないため）。フロント `buildAuthHeaders` を ID トークン送出に変更
- 決定: API は **ID トークンのみ受理**（`token_use === 'id'`）し、`aud === COGNITO_CLIENT_ID` を照合。アクセストークン受理は ensureUser の upsert で email を上書きする実害があったため廃止。検証ロジックは純関数 `validateClaims` に切り出し
- 通し検証: dev に auth-stack をデプロイ済み（`ninja-habits-deploy` プロファイル）。出力 — UserPoolId `ap-northeast-1_Zei8pcJQL` / ClientId `238a2ljuo5nnggq76m7df4p20d` / Hosted UI `https://ninja-habits-dev.auth.ap-northeast-1.amazoncognito.com`。Hosted UI ログイン → ID トークン取得 → API が JWT 検証 → `/v1/me`・`/v1/today` 200、改竄トークン/アクセストークンは 401 を確認
- 補足: デプロイは `ninja-habits-deploy` プロファイルが必要（既定の `body-data-lab-cli` は権限なし）。プレビューブラウザは外部オリジンへ遷移できないため、通しログインは実 Hosted UI に対する curl(PKCE) で実施
- 次のアクション: T-030 で dev に hosting/api/database をデプロイし、callbackUrls に本番 Web オリジンを追加。テストユーザー `ninja-dev@example.com`（dev pool, localhost callback のみ）は不要になれば削除

### 目標マスタ CRUD（T-025）

- 提案: `DELETE /v1/goals/{goalId}` は物理削除ではなく論理削除（`is_active = false`）にする
- 理由: 物理削除だと `goal_logs` が CASCADE で消え、streak と履歴が変わってしまう。非アクティブ化は `PATCH` の `is_active` でも可能で、DELETE はその冪等なショートカットとする
- 決定済み: 作成は `201`、`sort_order` はサーバーが末尾を割り当て。`/reorder` は送られた items を渡された順に 1..n で並べ直す（クライアントは全件送信）。`PATCH` の `version` 欠落は upsert ではないため `409` でなく `422`
- 次のアクション: GoalsScreen に並び替え UI（drag）が未実装のため、reorder API の画面接続は別タスク

### 習慣グループ/項目・通知（T-026）

- 提案: 習慣グループの削除も論理削除にするため、`habit_groups` に `is_active` を追加する（migration 002）
- 理由: 物理削除だと CASCADE で項目とログが消え streak/履歴が壊れる。グループ削除時は group.is_active=false のみで配下項目は触らない（復活時に項目ごと戻り、「削除前にどれがアクティブだったか」を失わない）。レビューで合意済み
- 決定済み: 通知設定の PUT は upsert 規約に合わせる（行なし+version 省略→v1 作成 / 行なし+指定→409 / あり+省略→409 / 不一致→409）。`GET /v1/today` の `notif.version` は通知行が無ければ `null`（従来は 1 を捏造しており、新規/更新を判別できなかった）

### Wish List CRUD（T-027）

- 提案: Wish List（`wish_categories` / `wish_items`）の削除は物理削除（CASCADE）とする
- 理由: goals/habits は日次ログ・streak を保持するため論理削除にしたが、Wish List はログや集計と無関係で保持すべき履歴が無い。is_active カラムを足す必要がなく、カテゴリ削除は FK CASCADE で配下項目も消えてよい。物理削除のため再 DELETE は `404`（goals/habits の冪等 204 とは挙動が異なる点に注意）
- 決定済み: 作成 `201`・末尾 sort_order・`/reorder` は全件 1..n、は goals/habits と同じ規約を踏襲

## 2026-06-11

- 提案: `GET /v1/today` の `goals[]` / `items[]` は `version`（マスタ）と `log_version`（当日ログ、なければ null）を分けて返す
- 理由: 従来の `COALESCE(ログ, マスタ)` 兼用では、クライアントが日次ログ PUT に `version` を送るべきか判別できず、初回チェックで誤送→409 になる。マスタ更新 API でも同じ曖昧さが出る。レビューで合意済み
- 決定済み: 日次ログ PUT のレスポンスは対象がログなので `version`（ログ version）のままとする
- 決定済み: 振り返りで採用した upsert conflict 方針（既存あり+version 省略→409 / なし+version 指定→409）と日付不正 422 を api-design.md に反映し、日次ログ API にも適用する

## 2026-06-11

- 提案: `PUT /v1/reflections/{date}` の日付範囲外エラーは `400` ではなく `422 validation_error` で返す
- 理由: `docs/api-design.md` のルール節は「未来日と31日以上前は 400」だが、同ドキュメントのエラーコード表に 400 がなく、入力不正は `validation_error`(422)と定義されている。既存の `GET /v1/today` も日付不正で 422 を返すため、422 に統一した。api-design.md 側の記述更新は別途検討
- 決定済み: 「対象日の振り返りが存在するのに `version` 省略」と「存在しないのに `version` 指定」はどちらも `409 conflict` とする。クライアント状態が古いケースであり、409 の救済手順（再取得して再試行）がそのまま当てはまるため
- 次のアクション: `PUT /v1/daily-logs/...` 実装時も同じ規約を使う。api-design.md の「400」表記を 422 に直すか判断する

- 提案: v1 の API 実装と DB migration は `ninja-habits` リポジトリ内の `api/` 配下に置く
- 理由: フロントと API の契約を同じリポジトリで追えるようにし、infra は CDK 専用リポジトリとして分けたままにするため
- 次のアクション: `GET /v1/today` の API 実装と PostgreSQL 接続を追加する

## 2026-06-06

- 提案: localStorage の `AppState` を、API では「マスタ」「日次ログ」「振り返り」「Wish List」に分けて扱う
- 理由: 現在のハリボテ実装では設定値と今日の達成状態が同じオブジェクトに混在しているため、DB 永続化時は日付を持つ状態を `goal_logs`、`habit_item_logs`、`reflections` に分離した方が履歴、同期、認可を整理しやすい
- 決定済み: 認証は Cognito、DB は RDS PostgreSQL、楽観ロックは `version`、日次ログは `goal_logs` / `habit_item_logs` 分割

## 2026-05-30

- 提案: アカウント管理を見据えて RDB 前提の `docs/db-design.md` を作成する
- 理由: 習慣、目標、達成ログ、振り返り、通知設定は関係性がはっきりしており、ユーザーごとの認可もRDBで整理しやすいため
- 次のアクション: 実際に使うDB、UUID生成、論理削除、同期競合、振り返り本文の暗号化を決める

## 2026-05-30

- 提案: アカウントごとに習慣データを管理する前提で `docs/security.md` を作成する
- 理由: 認証、認可、暗号化、保存、ログの方針を実装前に分けて考えるため
- 決定済み: 認証は Cognito、サーバー同期は Paid、DB は RDS PostgreSQL。ユーザー削除時の扱いは未決定

## 2026-05-24

- 提案: `docs/` フォルダを作成し、提案を蓄積できるようにする
- 理由: 会話の中で出た案を忘れず、後から見返せるようにする
- 次のアクション: 今後の提案はこのファイルに日付付きで追記する
- 提案: `2026-05-25 14:00 JST` に Claude Design のトークンが回復する想定で、それまでに準備を進める
- 理由: トークン回復後にすぐ作業へ入れる状態を先に整えておきたい
- 次のアクション: 回復までに必要な素材、要件、作業手順を整理する
