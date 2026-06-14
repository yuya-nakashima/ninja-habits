// Shared domain type definitions.

import type { Dispatch, SetStateAction } from 'react';

export interface NotifSettings {
  on: boolean;
  times: string[];      // HH:mm strings
  days: boolean[];      // length 7, Mon=0 … Sun=6
  version?: number | null;   // 通知行の version。未作成なら null
}

export interface HabitItem {
  id: string;
  content: string;
  done: boolean;
  count: number;
  notif: NotifSettings;
  version?: number;
  log_version?: number | null;   // 当日ログの version。ログ未作成なら null
}

export interface HabitGroup {
  id: string;
  name: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  items: HabitItem[];
  version?: number;
}

export interface Goal {
  id: string;
  content: string;
  minimum_goal: string | null;
  done: boolean;
  minimum_done: boolean;
  count: number;
  version?: number;
  log_version?: number | null;   // 当日ログの version。ログ未作成なら null
}

export interface StreakCell {
  label: string;
  hit: boolean;
  today: boolean;
}

export interface WishItem {
  id: string;
  content: string;
  version?: number;
}

export interface WishCategory {
  id: string;
  name: string;
  items: WishItem[];
  version?: number;
}

export interface HistoryEntry {
  day: string;                      // YYYY-MM-DD
  free_text: string | null;
  want_to_do: string | null;
  unconscious_desire: string | null;
  version?: number;
}

export interface AppState {
  goals: Goal[];
  groups: HabitGroup[];
  streak: StreakCell[];
  wishes: WishCategory[];
  history: HistoryEntry[];
  streakDate: string;               // YYYY-MM-DD
}

/** Current JST time components used by calcNextNotif(). */
export interface JSTNow {
  h: number;    // 0–23
  m: number;    // 0–59
  dow: number;  // 0=Mon … 6=Sun
}

/** Screen identifiers for the app router. */
export type ScreenId = 'home' | 'goals' | 'habits' | 'history' | 'wishes';

/** Prop shape shared by all screen components. */
export interface ScreenProps {
  goto: (screen: ScreenId) => void;
  onLogout: () => void;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  repo: AppRepository;
}

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

/** API-backed persistence operations passed to screens. */
export interface AppRepository {
  saveReflection(date: string, payload: ReflectionPayload): Promise<HistoryEntry>;
  listReflections(range?: { from?: string; to?: string }): Promise<HistoryEntry[]>;
  saveGoalLog(date: string, goalId: string, payload: GoalLogPayload): Promise<DailyLogResult>;
  saveHabitItemLog(date: string, habitItemId: string, payload: HabitItemLogPayload): Promise<DailyLogResult>;
  createGoal(payload: GoalCreatePayload): Promise<GoalMaster>;
  updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<GoalMaster>;
  deleteGoal(goalId: string): Promise<void>;
  createHabitGroup(payload: HabitGroupCreatePayload): Promise<HabitGroupMaster>;
  updateHabitGroup(groupId: string, payload: HabitGroupUpdatePayload): Promise<HabitGroupMaster>;
  deleteHabitGroup(groupId: string): Promise<void>;
  createHabitItem(groupId: string, payload: HabitItemCreatePayload): Promise<HabitItemMaster>;
  updateHabitItem(itemId: string, payload: HabitItemUpdatePayload): Promise<HabitItemMaster>;
  deleteHabitItem(itemId: string): Promise<void>;
  saveNotification(itemId: string, payload: NotificationPayload): Promise<NotificationResult>;
  createWishCategory(payload: WishCategoryCreatePayload): Promise<WishCategoryMaster>;
  updateWishCategory(categoryId: string, payload: WishCategoryUpdatePayload): Promise<WishCategoryMaster>;
  deleteWishCategory(categoryId: string): Promise<void>;
  createWishItem(categoryId: string, payload: WishItemCreatePayload): Promise<WishItemMaster>;
  updateWishItem(itemId: string, payload: WishItemUpdatePayload): Promise<WishItemMaster>;
  deleteWishItem(itemId: string): Promise<void>;
  reloadToday(): Promise<void>;
}
