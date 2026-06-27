// API DTO types — `/v1/*` のリクエスト / レスポンス形（wire format）。
// Infrastructure（apiClient）と Application が変換に使う。Presentation から直接は触らない。

import type { HistoryEntry } from './domainTypes';

export const API_CONFLICT_ERROR_NAME = 'ApiConflictError';

/** Reflection text payload for reflection saves. version は既存更新時のみ。 */
export type ReflectionPayload = Pick<HistoryEntry, 'free_text' | 'want_to_do' | 'unconscious_desire' | 'version'>;

/** Daily log payloads. version は当日ログ更新時のみ（新規は省略）。 */
export interface GoalLogPayload {
  done: boolean;
  count: number;
  minimum_done: boolean;
  version?: number;
}

export interface HabitItemLogPayload {
  done: boolean;
  count: number;
  version?: number;
}

/** PUT /v1/daily-logs/... のレスポンス。version はログの version。 */
export interface DailyLogResult {
  done: boolean;
  count: number;
  minimum_done?: boolean;
  version: number;
}

/** 目標マスタ（/v1/goals 系のレスポンス）。version はマスタの version。 */
export interface GoalMaster {
  id: string;
  content: string;
  minimum_goal: string | null;
  is_active: boolean;
  version: number;
}

export interface GoalCreatePayload {
  content: string;
  minimum_goal: string | null;
}

export interface GoalUpdatePayload {
  content?: string;
  minimum_goal?: string | null;
  is_active?: boolean;
  version: number;
}

/** 習慣グループマスタ（/v1/habit-groups 系のレスポンス）。 */
export interface HabitGroupMaster {
  id: string;
  name: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  is_active: boolean;
  version: number;
}

export interface HabitGroupCreatePayload {
  name: string;
}

export interface HabitGroupUpdatePayload {
  name?: string;
  woop_wish?: string | null;
  woop_outcome?: string | null;
  woop_obstacle?: string | null;
  woop_plan?: string | null;
  is_active?: boolean;
  version: number;
}

/** 習慣項目マスタ（/v1/habit-items 系のレスポンス）。 */
export interface HabitItemMaster {
  id: string;
  group_id: string;
  content: string;
  is_active: boolean;
  version: number;
}

export interface HabitItemCreatePayload {
  content: string;
}

export interface HabitItemUpdatePayload {
  content?: string;
  is_active?: boolean;
  version: number;
}

/** 通知設定（PUT /v1/habit-items/{id}/notification）。version は更新時のみ。 */
export interface NotificationPayload {
  on: boolean;
  times: string[];
  days: boolean[];
  version?: number;
}

export interface NotificationResult {
  on: boolean;
  times: string[];
  days: boolean[];
  version: number;
}

/** Wish List カテゴリ・項目マスタ（/v1/wish-* 系のレスポンス）。 */
export interface WishCategoryMaster {
  id: string;
  name: string;
  version: number;
}

export interface WishItemMaster {
  id: string;
  category_id: string;
  content: string;
  version: number;
}

export interface WishCategoryCreatePayload { name: string }
export interface WishCategoryUpdatePayload { name: string; version: number }
export interface WishItemCreatePayload { content: string }
export interface WishItemUpdatePayload { content: string; version: number }

/** PATCH .../reorder のリクエスト（表示順に並べた全件 + version）。 */
export interface ReorderPayload {
  items: { id: string; version: number }[];
}

/** PATCH .../reorder のレスポンス。各件の新 sort_order と更新後 version。 */
export interface ReorderResult {
  items: { id: string; sort_order: number; version: number }[];
}
