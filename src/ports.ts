// Application ports — Repository インターフェース（内側が依存する窓口）。
// 具体実装は Infrastructure（apiClient）が持つ。screens はこの型を通してのみ保存を呼ぶ。

import type { HistoryEntry } from './domainTypes';
import type {
  DailyLogResult, GoalCreatePayload, GoalLogPayload, GoalMaster, GoalUpdatePayload,
  HabitGroupCreatePayload, HabitGroupMaster, HabitGroupUpdatePayload,
  HabitItemCreatePayload, HabitItemLogPayload, HabitItemMaster, HabitItemUpdatePayload,
  NotificationPayload, NotificationResult, ReflectionPayload, ReorderPayload, ReorderResult,
  WishCategoryCreatePayload, WishCategoryMaster, WishCategoryUpdatePayload,
  WishItemCreatePayload, WishItemMaster, WishItemUpdatePayload,
} from './apiTypes';

/** API-backed persistence operations passed to screens. */
export interface AppRepository {
  saveReflection(date: string, payload: ReflectionPayload): Promise<HistoryEntry>;
  listReflections(range?: { from?: string; to?: string }): Promise<HistoryEntry[]>;
  saveGoalLog(date: string, goalId: string, payload: GoalLogPayload): Promise<DailyLogResult>;
  saveHabitItemLog(date: string, habitItemId: string, payload: HabitItemLogPayload): Promise<DailyLogResult>;
  createGoal(payload: GoalCreatePayload): Promise<GoalMaster>;
  updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<GoalMaster>;
  deleteGoal(goalId: string): Promise<void>;
  reorderGoals(payload: ReorderPayload): Promise<ReorderResult>;
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
