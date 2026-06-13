// Pure domain logic — no side effects, no React, no storage.

import type { AppState, HistoryEntry, JSTNow, StreakCell } from './types';

export const DOW_LABELS: string[] = ['月', '火', '水', '木', '金', '土', '日'];

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export function advanceStreak(streak: StreakCell[], prevDateISO: string, todayISO: string): StreakCell[] {
  if (!prevDateISO || prevDateISO === todayISO) return streak;

  const prevMs  = Date.parse(prevDateISO + 'T12:00:00+09:00');
  const todayMs = Date.parse(todayISO    + 'T12:00:00+09:00');
  const diff = Math.round((todayMs - prevMs) / 86400000);

  if (diff <= 0) return streak;

  const advance = Math.min(diff, 14);
  const retained: StreakCell[] = streak.slice(advance).map(d => ({ ...d, today: false }));

  const newCells: StreakCell[] = [];
  for (let i = advance - 1; i >= 0; i--) {
    const cellMs = todayMs - i * 86400000;
    const dow    = (new Date(cellMs).getDay() + 6) % 7;
    newCells.push({ label: DOW_LABELS[dow], hit: false, today: i === 0 });
  }

  return [...retained, ...newCells].slice(-14);
}

export function markTodayHit(streak: StreakCell[]): StreakCell[] {
  return streak.map(d => d.today ? { ...d, hit: true } : d);
}

// ---------------------------------------------------------------------------
// Daily reset
// ---------------------------------------------------------------------------

export function advanceDailyState(state: AppState, prevDateISO: string, todayISO: string): AppState {
  if (!prevDateISO || prevDateISO === todayISO) return state;
  return {
    ...state,
    streak:     advanceStreak(state.streak, prevDateISO, todayISO),
    streakDate: todayISO,
    goals:  state.goals.map(g  => ({ ...g, done: false, count: 0, minimum_done: false })),
    groups: state.groups.map(g => ({
      ...g,
      items: g.items.map(it => ({ ...it, done: false, count: 0 })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Calculate the display string for the next scheduled notification.
 * @param times  HH:mm strings
 * @param days   boolean[7], Mon=0 … Sun=6
 * @param jstNow current JST time — caller must provide getJSTNow()
 */
export function calcNextNotif(times: string[], days: boolean[], jstNow: JSTNow): string {
  if (times.length === 0 || days.every(d => !d)) return '—';

  const { h: nowH, m: nowM, dow: todayDow } = jstNow;
  const sortedTimes = times.slice().sort();

  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayDow + offset) % 7;
    if (!days[dow]) continue;

    for (const t of sortedTimes) {
      const [h, m] = t.split(':').map(Number);
      if (offset === 0) {
        if (nowH * 60 + nowM >= h * 60 + m) continue;
        return `今日 ${t}（${DOW_LABELS[dow]}）`;
      }
      const prefix = offset === 1 ? '明日' : DOW_LABELS[dow];
      return `${prefix} ${t}（${DOW_LABELS[dow]}）`;
    }
  }

  return '—';
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function upsertReflection(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (history.some(r => r.day === entry.day)) {
    return history.map(r => r.day === entry.day ? { ...r, ...entry } : r);
  }
  return [entry, ...history];
}
