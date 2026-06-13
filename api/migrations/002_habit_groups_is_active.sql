-- グループ削除を論理削除にするため is_active を追加する。
-- 配下の habit_items / habit_item_logs は触らない（streak と履歴を保持する）。

BEGIN;

ALTER TABLE habit_groups
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

COMMIT;
