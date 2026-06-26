// Domain types — アプリ内部のドメインモデル / 状態。
// UI・DB・API の都合を含めない（architecture.md「型方針」）。純粋な型のみで、import を持たない。

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
