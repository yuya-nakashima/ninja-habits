// Application-layer use cases — AppState → AppState transformations.
// todayISO is always injected by callers (via getTodayISO()) so this layer
// has no direct dependency on infrastructure.ts.

import { advanceDailyState, markTodayHit, upsertReflection } from './domain';
import type { AppState } from './domainTypes';
import type { AppRepository } from './ports';
import { API_CONFLICT_ERROR_NAME } from './apiTypes';
import type {
  DailyLogResult, GoalMaster, HabitGroupMaster, HabitItemMaster,
  NotificationResult, ReflectionPayload, WishCategoryMaster, WishItemMaster,
} from './apiTypes';

const DEFAULT_NOTIF = {
  on: false,
  times: ['07:00'],
  days: [true, true, true, true, true, false, false],
  version: null,
} as const;

// ---------------------------------------------------------------------------
// Base helper
// ---------------------------------------------------------------------------

export function withTodayBase(s: AppState, todayISO: string): AppState {
  return s.streakDate !== todayISO ? advanceDailyState(s, s.streakDate, todayISO) : s;
}

// ---------------------------------------------------------------------------
// Goal master results — /v1/goals 系 API のレスポンスを state へ反映する
// ---------------------------------------------------------------------------

export function applyGoalCreated(s: AppState, master: GoalMaster): AppState {
  return {
    ...s,
    goals: [...s.goals, {
      id: master.id,
      content: master.content,
      minimum_goal: master.minimum_goal,
      done: false, minimum_done: false, count: 0,
      version: master.version,
      log_version: null,
    }],
  };
}

export function applyGoalMasterUpdated(s: AppState, master: GoalMaster): AppState {
  // 今日画面は is_active=true のみ表示するため、非アクティブ化は一覧から外す
  if (!master.is_active) {
    return { ...s, goals: s.goals.filter(g => g.id !== master.id) };
  }
  return {
    ...s,
    goals: s.goals.map(g => g.id !== master.id ? g
      : { ...g, content: master.content, minimum_goal: master.minimum_goal, version: master.version }),
  };
}

export function applyGoalDeleted(s: AppState, goalId: string): AppState {
  return { ...s, goals: s.goals.filter(g => g.id !== goalId) };
}

// ---------------------------------------------------------------------------
// Habit group / item / notification results — /v1/habit-* 系 API のレスポンス反映
// ---------------------------------------------------------------------------

export function applyGroupCreated(s: AppState, master: HabitGroupMaster): AppState {
  return {
    ...s,
    groups: [...s.groups, {
      id: master.id,
      name: master.name,
      woop_wish: master.woop_wish,
      woop_outcome: master.woop_outcome,
      woop_obstacle: master.woop_obstacle,
      woop_plan: master.woop_plan,
      items: [],
      version: master.version,
    }],
  };
}

export function applyGroupMasterUpdated(s: AppState, master: HabitGroupMaster): AppState {
  // 画面は is_active=true のみ表示するため、非アクティブ化は一覧から外す
  if (!master.is_active) {
    return { ...s, groups: s.groups.filter(g => g.id !== master.id) };
  }
  return {
    ...s,
    groups: s.groups.map(g => g.id !== master.id ? g : {
      ...g,
      name: master.name,
      woop_wish: master.woop_wish,
      woop_outcome: master.woop_outcome,
      woop_obstacle: master.woop_obstacle,
      woop_plan: master.woop_plan,
      version: master.version,
    }),
  };
}

export function applyGroupDeleted(s: AppState, groupId: string): AppState {
  return { ...s, groups: s.groups.filter(g => g.id !== groupId) };
}

export function applyItemCreated(s: AppState, master: HabitItemMaster): AppState {
  return {
    ...s,
    groups: s.groups.map(g => g.id !== master.group_id ? g : {
      ...g,
      items: [...g.items, {
        id: master.id,
        content: master.content,
        done: false, count: 0,
        version: master.version,
        log_version: null,
        notif: { ...DEFAULT_NOTIF, times: [...DEFAULT_NOTIF.times], days: [...DEFAULT_NOTIF.days] },
      }],
    }),
  };
}

export function applyItemMasterUpdated(s: AppState, groupId: string, master: HabitItemMaster): AppState {
  if (!master.is_active) {
    return applyItemDeleted(s, groupId, master.id);
  }
  return {
    ...s,
    groups: s.groups.map(g => g.id !== groupId ? g : {
      ...g,
      items: g.items.map(it => it.id !== master.id ? it
        : { ...it, content: master.content, version: master.version }),
    }),
  };
}

export function applyItemDeleted(s: AppState, groupId: string, itemId: string): AppState {
  return {
    ...s,
    groups: s.groups.map(g => g.id !== groupId ? g : { ...g, items: g.items.filter(it => it.id !== itemId) }),
  };
}

export function applyNotifSaved(s: AppState, groupId: string, itemId: string, notif: NotificationResult): AppState {
  return {
    ...s,
    groups: s.groups.map(g => g.id !== groupId ? g : {
      ...g,
      items: g.items.map(it => it.id !== itemId ? it
        : { ...it, notif: { on: notif.on, times: notif.times, days: notif.days, version: notif.version } }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Wish List results — /v1/wish-* 系 API のレスポンス反映
// ---------------------------------------------------------------------------

export function applyWishCategoryCreated(s: AppState, master: WishCategoryMaster): AppState {
  return { ...s, wishes: [...s.wishes, { id: master.id, name: master.name, version: master.version, items: [] }] };
}

export function applyWishCategoryUpdated(s: AppState, master: WishCategoryMaster): AppState {
  return {
    ...s,
    wishes: s.wishes.map(c => c.id !== master.id ? c : { ...c, name: master.name, version: master.version }),
  };
}

export function applyWishCategoryDeleted(s: AppState, categoryId: string): AppState {
  return { ...s, wishes: s.wishes.filter(c => c.id !== categoryId) };
}

export function applyWishItemCreated(s: AppState, master: WishItemMaster): AppState {
  return {
    ...s,
    wishes: s.wishes.map(c => c.id !== master.category_id ? c
      : { ...c, items: [...c.items, { id: master.id, content: master.content, version: master.version }] }),
  };
}

export function applyWishItemUpdated(s: AppState, categoryId: string, master: WishItemMaster): AppState {
  return {
    ...s,
    wishes: s.wishes.map(c => c.id !== categoryId ? c
      : { ...c, items: c.items.map(it => it.id !== master.id ? it : { ...it, content: master.content, version: master.version }) }),
  };
}

export function applyWishItemDeleted(s: AppState, categoryId: string, itemId: string): AppState {
  return {
    ...s,
    wishes: s.wishes.map(c => c.id !== categoryId ? c : { ...c, items: c.items.filter(it => it.id !== itemId) }),
  };
}

// ---------------------------------------------------------------------------
// Daily log results — API レスポンスを state へ反映する
// （次の値の計算は HomeScreen 側で行い、ここでは API の返却値をそのまま当てる）
// ---------------------------------------------------------------------------

export function applyGoalLogResult(s: AppState, goalId: string, log: DailyLogResult, todayISO: string): AppState {
  const base = withTodayBase(s, todayISO);
  return {
    ...base,
    goals: base.goals.map(g => g.id !== goalId ? g
      : { ...g, done: log.done, count: log.count, minimum_done: log.minimum_done ?? g.minimum_done, log_version: log.version }),
    // サーバーの streak 集計は done または minimum_done を hit に数える
    streak:     log.done || log.minimum_done === true ? markTodayHit(base.streak) : base.streak,
    streakDate: todayISO,
  };
}

export function applyItemLogResult(s: AppState, groupId: string, itemId: string, log: DailyLogResult, todayISO: string): AppState {
  const base = withTodayBase(s, todayISO);
  return {
    ...base,
    groups: base.groups.map(g => g.id !== groupId ? g
      : { ...g, items: g.items.map(it => it.id !== itemId ? it
        : { ...it, done: log.done, count: log.count, log_version: log.version }) }),
    streak:     log.done ? markTodayHit(base.streak) : base.streak,
    streakDate: todayISO,
  };
}

// ---------------------------------------------------------------------------
// Reflection use case
// ---------------------------------------------------------------------------

export function applySaveReflection(s: AppState, payload: ReflectionPayload, todayISO: string): AppState {
  const base = withTodayBase(s, todayISO);
  return {
    ...base,
    streak:  markTodayHit(base.streak),
    streakDate: todayISO,
    history: upsertReflection(base.history, { day: todayISO, ...payload }),
  };
}

// ---------------------------------------------------------------------------
// Repository request failure handling
// ---------------------------------------------------------------------------

export type RepositoryRequestFailure = 'conflict' | 'failure';

function isRepositoryConflictError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === API_CONFLICT_ERROR_NAME;
}

/**
 * reload を伴わずに失敗種別だけを判定する。
 * 楽観更新を自前で破棄する画面（reloadToday を常に呼ぶ）が、表示文言の選択に使う。
 */
export function classifyRepositoryRequestFailure(error: unknown): RepositoryRequestFailure {
  return isRepositoryConflictError(error) ? 'conflict' : 'failure';
}

/**
 * conflict（409 相当）なら最新状態を取り込んでから種別を返す。
 * リクエスト前に楽観更新しない画面（HomeScreen など）向け。
 */
export async function recoverRepositoryRequestFailure(
  error: unknown,
  repo: Pick<AppRepository, 'reloadToday'>,
): Promise<RepositoryRequestFailure> {
  const failure = classifyRepositoryRequestFailure(error);
  if (failure === 'conflict') await repo.reloadToday().catch(() => undefined);
  return failure;
}
