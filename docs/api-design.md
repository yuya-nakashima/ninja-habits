# API Design

`ninja-habits` の Web 版を DB 保存で提供するための API 設計メモです。
DB は `docs/db-design.md` を基準にします。

## 方針

- REST API から始める
- API は認証必須にする
- リクエストに `user_id` を含めない
- サーバーは認証済みユーザーから `user_id` を決める
- 画面初期表示は `GET /v1/today` でまとめて取得する
- 更新系は小さい単位で保存する
- 日付は JST のアプリ内日付として `YYYY-MM-DD` を使う
- レスポンスはフロントの `AppState` に近い形へ寄せるが、DB ではマスタと日次ログを分ける

## 現在の AppState との分解

| AppState | API / DB での扱い |
| --- | --- |
| `goals[].content`, `minimum_goal` | `goals` のマスタ |
| `goals[].done`, `count`, `minimum_done` | `goal_logs` |
| `groups[]` | `habit_groups` |
| `groups[].items[].content` | `habit_items` |
| `groups[].items[].done`, `count` | `habit_item_logs` |
| `groups[].items[].notif` | `habit_item_notifications` |
| `history[]` | `reflections` |
| `wishes[]` | `wish_categories`, `wish_items` |
| `streak[]` | `goal_logs`、`habit_item_logs`、`reflections` から API 側で生成 |
| `streakDate` | クライアント保存用の都合。サーバー永続化は不要 |

## 認証

v1 の Web 版では Cognito User Pool を使う。
メール/パスワード、Google、Apple を同じタイミングで有効化し、API は Cognito JWT を検証して認証済みユーザーを特定する。
DB は `users.cognito_sub` をユーザー特定の基準にし、自前の `password_hash` は持たない。

```http
GET /v1/me
```

```json
{
  "id": "user_123",
  "email": "user@example.com"
}
```

## 初期表示

```http
GET /v1/today?date=2026-06-06
```

`date` は省略可能。省略時はサーバー側で JST 今日を使う。

- `streak[]` は `date` を含む直近14日分を返す
- `history[]` は直近7件を返す（全履歴は `GET /v1/reflections` で取得する）
- `goals[]` / `items[]` の `version` はマスタの version。当日ログの version は `log_version`（ログがなければ `null`）で返す

```json
{
  "date": "2026-06-06",
  "goals": [
    {
      "id": "goal_1",
      "content": "瞑想を30分行う",
      "minimum_goal": "キツい日は1分だけでOK",
      "done": false,
      "minimum_done": false,
      "count": 0,
      "version": 1,
      "log_version": null
    }
  ],
  "groups": [
    {
      "id": "group_1",
      "name": "朝の習慣",
      "woop_wish": "毎朝、気持ちを整える",
      "woop_outcome": null,
      "woop_obstacle": null,
      "woop_plan": null,
      "version": 1,
      "items": [
        {
          "id": "item_1",
          "content": "水を200ml飲む",
          "done": true,
          "count": 1,
          "version": 1,
          "log_version": 1,
          "notif": {
            "on": true,
            "times": ["07:00"],
            "days": [true, true, true, true, true, false, false],
            "version": 1
          }
        }
      ]
    }
  ],
  "streak": [
    { "label": "月", "hit": true, "today": false }
  ],
  "wishes": [
    {
      "id": "cat_1",
      "name": "読みたい本",
      "version": 1,
      "items": [
        {
          "id": "wish_1",
          "content": "アトミック・ハビット",
          "version": 1
        }
      ]
    }
  ],
  "history": [
    {
      "date": "2026-06-05",
      "free_text": "朝の時間が取れた。",
      "want_to_do": "体が軽くなる感覚に焦点を当てる。",
      "unconscious_desire": "静かな夜が欲しい。",
      "version": 1
    }
  ]
}
```

## 目標

`/reorder` は `{goalId}` より先に固定パスとして定義する（他のリソースも同様）。

```http
GET /v1/goals
POST /v1/goals
PATCH /v1/goals/reorder
PATCH /v1/goals/{goalId}
DELETE /v1/goals/{goalId}
```

作成:

```json
{
  "content": "ブログ記事を1つ書き始める",
  "minimum_goal": "1段落だけ書く"
}
```

更新（`version` 必須。不一致時は `409 conflict`）:

```json
{
  "content": "ブログ記事を1つ下書きする",
  "minimum_goal": null,
  "is_active": true,
  "version": 1
}
```

更新レスポンス:

```json
{
  "id": "goal_1",
  "content": "ブログ記事を1つ下書きする",
  "minimum_goal": null,
  "is_active": true,
  "version": 2
}
```

並び替え（各 `id` の `version` 必須。1件でも不一致なら `409`）:

```json
{
  "items": [
    { "id": "goal_2", "version": 1 },
    { "id": "goal_1", "version": 3 }
  ]
}
```

並び替えレスポンス:

```json
{
  "items": [
    { "id": "goal_2", "sort_order": 1, "version": 2 },
    { "id": "goal_1", "sort_order": 2, "version": 4 }
  ]
}
```

ルール:

- 作成は `201` を返す。`sort_order` はサーバーが末尾（既存最大 + 1）を割り当てる
- `PATCH /v1/goals/{goalId}` は送られたフィールドだけ更新する。`version` は常に必須（欠落は `422`。upsert ではないため 409 方針の対象外）
- `DELETE /v1/goals/{goalId}` は論理削除（`is_active = false`）。`goal_logs` を保持して streak / 履歴を守る。冪等で、成功時は `204`
- `/reorder` は送られた `items` を渡された順に `sort_order = 1..n` へ並べ直す。クライアントは表示中の全件を送る

## 日次ログ

目標と習慣項目の達成状態は、DB の `goal_logs` / `habit_item_logs` に合わせて API も分ける。

```http
PUT /v1/daily-logs/{date}/goals/{goalId}
PUT /v1/daily-logs/{date}/habit-items/{habitItemId}
```

目標ログ（新規作成時は `version` 不要。既存ログ更新時は `version` 必須）:

```json
{
  "done": true,
  "count": 1,
  "minimum_done": true,
  "version": 1
}
```

習慣項目ログ（新規作成時は `version` 不要。既存ログ更新時は `version` 必須）:

```json
{
  "done": true,
  "count": 1,
  "version": 1
}
```

更新レスポンス（このエンドポイントの対象はログなので、`version` はログの version）:

```json
{
  "date": "2026-06-11",
  "done": true,
  "count": 1,
  "minimum_done": true,
  "version": 1
}
```

ルール:

- `date` は JST アプリ内日付。今日から過去30日まで受け付ける。未来日と31日以上前は `422`
- `done=false` の場合、`count=0` にする
- `minimum_done` は目標ログだけで受け付ける
- 対象マスタの所有者を必ず確認する。存在しない、または所有していない場合は `404`
- 日次ログは upsert する。当日ログがない場合は新規作成（サーバーが `version=1` で作成）し、ある場合は `version` 確認後に更新する
- `version` 不一致の場合は `409 conflict` を返す
- `GET /v1/today` の `version` はマスタの version。当日ログの version は `log_version` で返し、ログがない場合は `log_version: null` とする。日次ログ更新 API に送るのは `log_version`、マスタ更新 API に送るのは `version`

## 習慣グループ

`PATCH /v1/habit-groups/reorder` のリクエスト/レスポンス形式は目標の `/reorder` と同じ（`items: [{ id, version }]`）。

```http
GET /v1/habit-groups
POST /v1/habit-groups
PATCH /v1/habit-groups/reorder
PATCH /v1/habit-groups/{groupId}
DELETE /v1/habit-groups/{groupId}
```

作成:

```json
{
  "name": "朝の習慣"
}
```

更新（`version` 必須）:

```json
{
  "name": "朝のルーティン",
  "woop_wish": "毎朝、気持ちを整える",
  "woop_outcome": "落ち着いて一日を始められる",
  "woop_obstacle": "ベッドでスマホを見てしまう",
  "woop_plan": "もしスマホを触ったら、水を飲みに行く",
  "version": 1
}
```

ルール（目標と同じ規約）:

- 作成は `201`。`sort_order` はサーバーが末尾を割り当てる
- `PATCH` は送られたフィールドだけ更新する。`version` は常に必須（欠落は `422`）
- `DELETE` は論理削除（`is_active = false`）。配下の習慣項目・ログは触らない（streak / 履歴を保持し、`PATCH is_active=true` で項目ごと復活できる）。冪等で `204`
- `/reorder` は送られた `items` を渡された順に `sort_order = 1..n` へ並べ直す

## 習慣項目

`PATCH /v1/habit-groups/{groupId}/items/reorder` のリクエスト/レスポンス形式は目標の `/reorder` と同じ（`items: [{ id, version }]`）。

```http
POST /v1/habit-groups/{groupId}/items
PATCH /v1/habit-groups/{groupId}/items/reorder
PATCH /v1/habit-items/{itemId}
DELETE /v1/habit-items/{itemId}
PUT /v1/habit-items/{itemId}/notification
```

習慣項目作成:

```json
{
  "content": "水を200ml飲む"
}
```

習慣項目更新（`version` 必須）:

```json
{
  "content": "水を300ml飲む",
  "version": 1
}
```

通知設定:

```json
{
  "on": true,
  "times": ["07:00", "22:30"],
  "days": [true, true, true, true, true, false, false],
  "version": 1
}
```

ルール:

- 項目の作成は `201`。`sort_order` はグループ内の末尾を割り当てる
- 項目の `DELETE` は論理削除（`is_active = false`）。`habit_item_logs` を保持する。冪等で `204`
- 通知設定は項目ごとに upsert する。通知行が存在しない場合は `version` 省略可（サーバーが `version=1` で作成）。存在する場合は `version` 必須で、不一致・省略は `409`
- `GET /v1/today` の `notif.version` は通知行が存在しない場合 `null` を返す。クライアントは `null` のとき `version` を省略して PUT する

## 振り返り

```http
GET /v1/reflections?from=2026-05-01&to=2026-06-06
PUT /v1/reflections/{date}
```

取得ルール:

- `from` / `to` の最大範囲は90日（両端含む）。超える場合は `422`
- 省略時の既定: `to` 省略は今日(JST)、`from` 省略は `to` の29日前（＝直近30日）
- `from` > `to` や日付形式不正は `422`
- レスポンスは `reflection_date` 降順。形式: `{ "reflections": [ { date, free_text, want_to_do, unconscious_desire, version } ] }`

保存:

```json
{
  "free_text": "朝の時間が取れた。",
  "want_to_do": "体が軽くなる感覚に焦点を当てる。",
  "unconscious_desire": "静かな夜が欲しい。",
  "version": 1
}
```

ルール:

- `date` は JST アプリ内日付。今日から過去30日まで受け付ける。未来日と31日以上前は `422`
- `date` ごとに upsert する（新規は `version=1` で作成）
- 対象日の振り返りが存在しない場合、`version` は省略可。サーバーは `version=1` で新規作成する
- 対象日の振り返りが存在する場合、`version` は必須。`version` 一致確認後に更新し、`version + 1` を返す
- `version` が一致しない場合は `409 conflict` を返す
- 保存した日は streak の hit 対象に含める
- 本文はログに出さない

## Wish List

`PATCH /v1/wish-categories/reorder` と `PATCH /v1/wish-categories/{categoryId}/items/reorder` のリクエスト/レスポンス形式は目標の `/reorder` と同じ（`items: [{ id, version }]`）。

```http
GET /v1/wish-categories
POST /v1/wish-categories
PATCH /v1/wish-categories/reorder
PATCH /v1/wish-categories/{categoryId}
DELETE /v1/wish-categories/{categoryId}
POST /v1/wish-categories/{categoryId}/items
PATCH /v1/wish-categories/{categoryId}/items/reorder
PATCH /v1/wish-items/{itemId}
DELETE /v1/wish-items/{itemId}
```

カテゴリ作成:

```json
{
  "name": "読みたい本"
}
```

カテゴリ更新（`version` 必須）:

```json
{
  "name": "読んだ本",
  "version": 1
}
```

項目作成:

```json
{
  "content": "アトミック・ハビット"
}
```

項目更新（`version` 必須）:

```json
{
  "content": "アトミック・ハビット（再読）",
  "version": 1
}
```

ルール:

- カテゴリ作成・項目作成は `201`。`sort_order` はサーバーが末尾を割り当てる（項目はカテゴリ内の末尾）
- `PATCH` は `version` 必須（欠落は `422`）。不一致は `409`
- `DELETE` は**物理削除**。Wish List は日次ログ・streak と無関係で保持すべき履歴が無いため、goals/habits の論理削除と異なり物理削除とする。カテゴリ削除時は配下項目も FK CASCADE で消える。存在しない・所有していない場合は `404`
- `/reorder` は送られた `items` を渡された順に `sort_order = 1..n` へ並べ直す

## エラー形式

```json
{
  "error": {
    "code": "validation_error",
    "message": "入力内容を確認してください",
    "fields": {
      "content": "必須です"
    }
  }
}
```

候補コード:

| code | HTTP | 用途 |
| --- | --- | --- |
| `unauthorized` | 401 | 未ログイン |
| `forbidden` | 403 | 他ユーザーのデータ |
| `not_found` | 404 | 存在しない、または所有していない |
| `validation_error` | 422 | 入力不正 |
| `conflict` | 409 | 楽観ロック失敗 |

## 入力バリデーション

| Field | Rule |
| --- | --- |
| `content` | 1 文字以上、最大 500 文字 |
| `name` | 1 文字以上、最大 100 文字 |
| `minimum_goal` | nullable、最大 500 文字 |
| `woop_*` | nullable、最大 1000 文字 |
| `free_text`, `want_to_do`, `unconscious_desire` | nullable、最大 5000 文字 |
| `date` | `YYYY-MM-DD`、今日から過去30日以内 |
| `times[]` | `HH:mm` |
| `days` | boolean 7 要素、Mon=0 |
| `count` | 0 以上の整数 |
| `version` | 1 以上の整数。既存レコード更新時と `/reorder` では必須。新規 upsert 作成時は省略可 |

## 同期と競合

`version` による楽観ロックを採用する。

- 既存レコードを更新する API は `version` を必須で受け取る。新規 upsert 作成時のみ省略を許可する
- DB 更新は `WHERE id = ? AND user_id = ? AND version = ?` で行う
- 成功時は `version + 1` をレスポンスに返す
- `version` が合わない場合は `409 conflict` を返す
- クライアントは `409` を受けたら最新データを再取得してから再試行する

upsert 系 API（振り返り、日次ログ）の conflict 方針:

- 対象レコードが存在するのに `version` 省略 → `409 conflict`
- 対象レコードが存在しないのに `version` 指定 → `409 conflict`
- どちらもクライアント状態が古いケースであり、`409` の救済手順（再取得→再試行）がそのまま当てはまるため、`422` ではなく `409` とする

## 最初の実装順

1. ~~Cognito auth-stack を作る~~ （実装済み）
2. RDS PostgreSQL の database-stack をデプロイする
3. DB マイグレーションを作る
4. `GET /v1/today` を作る
5. `PUT /v1/daily-logs/{date}/goals/{goalId}` と `PUT /v1/daily-logs/{date}/habit-items/{habitItemId}` を作る
6. 目標、習慣、振り返り、Wish List の順に CRUD を移す
7. フロントの保存処理を API Repository に寄せる
