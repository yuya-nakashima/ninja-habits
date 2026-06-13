# DB Design

`ninja-habits` をアカウントごとに管理する前提の RDB 設計メモです。
DB は RDS PostgreSQL から始め、必要になったら Aurora へ移行します。
テーブル詳細はサーバー同期を入れる前に精査します。

## 方針

- RDS PostgreSQL を前提に考える
- すべてのユーザーデータは `user_id` で分離する
- クライアントから渡された `user_id` は信用しない
- API 層で認証済みユーザーを特定し、そのユーザーのデータだけ操作する
- 主要テーブルには `created_at`, `updated_at` を持たせる
- 削除は最初は物理削除でよいが、復元や監査が必要になったら `deleted_at` を検討する
- 日付キーは JST のアプリ内日付として `date` 型で保存する
- 表示順が必要なものは `sort_order` を持たせる
- 複数端末同期に備えて、ユーザーが更新する主要テーブルに `version` integer を持たせる
- API レスポンスでは必要に応じてマスタと日次ログを合成する

## 最初のテーブル

| Table | 役割 |
| --- | --- |
| `users` | アカウント |
| `goals` | 今日の目標、ミニマム目標 |
| `habit_groups` | 習慣グループ |
| `habit_items` | 習慣項目 |
| `habit_item_notifications` | 習慣項目ごとの通知設定 |
| `goal_logs` | 目標の日ごとの達成記録 |
| `habit_item_logs` | 習慣項目の日ごとの達成記録 |
| `reflections` | 夜の振り返り |
| `wish_categories` | Wish List のカテゴリ |
| `wish_items` | Wish List の項目 |

`streak` は専用テーブルを作らず、`goal_logs`、`habit_item_logs`、`reflections` から API 側で生成する。
旧ブラウザプロトタイプの `AppState.streakDate` は日付繰り越し用なので、サーバー永続化の対象にしない。

## users

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `cognito_sub` | varchar | Cognito の sub クレーム。ユニーク。ユーザー特定の主キー的に扱う |
| `email` | varchar | ユニーク。Cognito から同期する |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |

認証は Cognito に委譲する。`password_hash` は持たない。
メール/パスワード・Google・Apple を Cognito 側で管理し、DB は `cognito_sub` でユーザーを特定する。

## goals

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `content` | text | 目標本文 |
| `minimum_goal` | text nullable | ミニマム目標 |
| `is_active` | boolean | 今日以降も使うか |
| `sort_order` | integer | 表示順 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

`done`, `count`, `minimum_done` は日ごとの状態なので `goals` には持たせず、`goal_logs` へ寄せる。
現在の `AppState.goals[].done/count/minimum_done` は API レスポンスで当日分の `goal_logs` を合成して返す。

## habit_groups

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `name` | varchar | グループ名 |
| `woop_wish` | text nullable | WOOP Wish |
| `woop_outcome` | text nullable | WOOP Outcome |
| `woop_obstacle` | text nullable | WOOP Obstacle |
| `woop_plan` | text nullable | WOOP Plan |
| `is_active` | boolean | 論理削除用。グループ削除時も配下項目・ログは保持する（migration 002 で追加） |
| `sort_order` | integer | 表示順 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

## habit_items

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `group_id` | uuid / varchar | `habit_groups.id` |
| `content` | text | 習慣本文 |
| `is_active` | boolean | 今日以降も使うか |
| `sort_order` | integer | 表示順 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

`user_id` は `group_id` から辿れるが、所有者チェックと検索を単純にするため持たせる。
保存時は `group_id` と `user_id` の整合性をサーバー側で確認する。
現在の `AppState.groups[].items[].done/count` は API レスポンスで当日分の `habit_item_logs` を合成して返す。

## habit_item_notifications

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `habit_item_id` | uuid / varchar | `habit_items.id` |
| `enabled` | boolean | 通知ON/OFF |
| `times` | json / text | `["07:00", "22:30"]` |
| `days` | json / text | `[true,true,true,true,true,false,false]`。Mon=0 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

最初は `times` と `days` を JSON で持つ。
通知条件で集計や検索が必要になったら正規化を検討する。

制約候補:

- unique: `user_id`, `habit_item_id`
- `times` は `HH:mm` 配列としてアプリ側、API 側で検証する
- `days` は 7 要素の boolean 配列として検証する

## goal_logs

目標の日ごとの達成状態を保存するテーブルです。

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `goal_id` | uuid / varchar | `goals.id` |
| `log_date` | date | JST のアプリ内日付 |
| `done` | boolean | 達成したか |
| `count` | integer | 達成回数 |
| `minimum_done` | boolean | ミニマム目標を達成したか |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

制約候補:

- unique: `user_id`, `log_date`, `goal_id`
- `count` は 0 以上にする
- `done = false` のときは `count = 0` に寄せる

`goal_id` は `goals.id` へ外部キーを張る。
作成、更新時は API 層でも `goal_id` と `user_id` の整合性を確認する。

## habit_item_logs

習慣項目の日ごとの達成状態を保存するテーブルです。

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `habit_item_id` | uuid / varchar | `habit_items.id` |
| `log_date` | date | JST のアプリ内日付 |
| `done` | boolean | 達成したか |
| `count` | integer | 達成回数 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

制約候補:

- unique: `user_id`, `log_date`, `habit_item_id`
- `count` は 0 以上にする
- `done = false` のときは `count = 0` に寄せる

`habit_item_id` は `habit_items.id` へ外部キーを張る。
作成、更新時は API 層でも `habit_item_id` と `user_id` の整合性を確認する。

## reflections

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `reflection_date` | date | JST のアプリ内日付 |
| `free_text` | text nullable | 今日どうだったか |
| `want_to_do` | text nullable | 本当にやりたいこと |
| `unconscious_desire` | text nullable | 無意識が求めていること |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

制約候補:

- unique: `user_id`, `reflection_date`

振り返り本文は私的な内容になりやすい。
サーバー保存する場合、追加暗号化やログ出力禁止を検討する。

## wish_categories

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `name` | varchar | カテゴリ名 |
| `sort_order` | integer | 表示順 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

## wish_items

| Column | Type | Memo |
| --- | --- | --- |
| `id` | uuid / varchar | 主キー |
| `user_id` | uuid / varchar | `users.id` |
| `category_id` | uuid / varchar | `wish_categories.id` |
| `content` | text | 項目本文 |
| `sort_order` | integer | 表示順 |
| `created_at` | timestamp | 作成日時 |
| `updated_at` | timestamp | 更新日時 |
| `version` | integer | 楽観ロック用。初期値 1 |

`category_id` と `user_id` の整合性をサーバー側で確認する。

## インデックス候補

| Table | Index | 目的 |
| --- | --- | --- |
| `goals` | `user_id, is_active, sort_order` | 目標一覧 |
| `habit_groups` | `user_id, sort_order` | グループ一覧 |
| `habit_items` | `user_id, group_id, sort_order` | グループ内習慣一覧 |
| `goal_logs` | `user_id, log_date` | 今日の目標達成状態 |
| `goal_logs` | `user_id, goal_id, log_date` | 目標ごとの履歴 |
| `habit_item_logs` | `user_id, log_date` | 今日の習慣達成状態 |
| `habit_item_logs` | `user_id, habit_item_id, log_date` | 習慣項目ごとの履歴 |
| `reflections` | `user_id, reflection_date` | 振り返り取得 |
| `wish_categories` | `user_id, sort_order` | Wishカテゴリ一覧 |
| `wish_items` | `user_id, category_id, sort_order` | Wish項目一覧 |

## 認可ルール

- すべての読み書きは認証済みユーザーを基準にする
- API は `user_id` をリクエストから受け取らない
- URL の `id` は対象IDとして扱い、所有者確認に使う
- 更新、削除前に `user_id` が一致することを確認する
- 子テーブル作成時は親レコードの `user_id` も確認する

## API への合成ルール

`GET /v1/today` のような画面向け API では、DB の正規化されたテーブルを以下のように合成する。

| Response field | Source |
| --- | --- |
| `goals[]` | `goals` + 当日の `goal_logs` |
| `groups[].items[]` | `habit_groups` + `habit_items` + `habit_item_notifications` + 当日の `habit_item_logs` |
| `streak[]` | 過去14日分の `goal_logs.done`、`habit_item_logs.done`、`reflections` |
| `history[]` | `reflections` |
| `wishes[]` | `wish_categories` + `wish_items` |

streak の `hit` は「目標、習慣項目、振り返りのいずれかをその日に記録したら true」から始める。
あとで厳密にしたい場合は、目標だけ、習慣だけ、振り返りだけなどの streak 種別を分ける。

## 未決定

- UUID を DB で生成するか、アプリ側で生成するか
- 物理削除か論理削除か
- サーバー同期時の競合解決
- 振り返り本文を追加暗号化するか
- 通知設定を JSON のまま持つか、正規化するか
- streak の hit 条件
