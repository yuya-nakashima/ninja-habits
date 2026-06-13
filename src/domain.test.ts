// Unit tests for domain and migration logic.
// Run: npm test  (vitest)

import { describe, it, expect } from 'vitest';
import { advanceStreak, markTodayHit, advanceDailyState, calcNextNotif } from './domain';
import { sanitizeNotif } from './migration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function makeStreak(n = 14) {
  return Array.from({ length: n }, (_, i) => ({
    label: DOW_LABELS[i % 7],
    hit:   false,
    today: i === n - 1,
  }));
}

function makeState({ goalsCount = 1, itemsCount = 1, streak, streakDate = '2025-01-01' }: {
  goalsCount?: number; itemsCount?: number; streak?: ReturnType<typeof makeStreak>; streakDate?: string;
} = {}) {
  return {
    streak: streak ?? makeStreak(),
    streakDate,
    goals: Array.from({ length: goalsCount }, (_, i) => ({
      id: `g${i}`, content: `goal ${i}`, done: true, count: 2, minimum_done: true, minimum_goal: null,
    })),
    groups: [{
      id: 'grp0', name: 'Morning',
      woop_wish: null, woop_outcome: null, woop_obstacle: null, woop_plan: null,
      items: Array.from({ length: itemsCount }, (_, i) => ({
        id: `it${i}`, content: `item ${i}`, done: true, count: 1,
        notif: { on: false, times: ['07:00'], days: [true,true,true,true,true,false,false] },
      })),
    }],
    history: [],
    wishes: [],
  };
}

// ---------------------------------------------------------------------------
// advanceStreak
// ---------------------------------------------------------------------------

describe('advanceStreak', () => {
  it('returns same streak when dates are equal', () => {
    const s = makeStreak();
    expect(advanceStreak(s, '2025-01-01', '2025-01-01')).toBe(s);
  });

  it('advances by 1 day — today cell becomes last', () => {
    const s = makeStreak();
    const result = advanceStreak(s, '2025-01-01', '2025-01-02');
    expect(result).toHaveLength(14);
    expect(result[13].today).toBe(true);
    expect(result[12].today).toBe(false);
  });

  it('advances by 3 days — 3 new cells appended', () => {
    const s = makeStreak();
    const result = advanceStreak(s, '2025-01-01', '2025-01-04');
    expect(result).toHaveLength(14);
    const newCells = result.slice(11);
    expect(newCells.every(c => c.hit === false)).toBe(true);
    expect(result[13].today).toBe(true);
  });

  it('caps advance at 14 days — full window replaced', () => {
    const s = makeStreak();
    const result = advanceStreak(s, '2025-01-01', '2025-01-20');
    expect(result).toHaveLength(14);
    expect(result.every(c => c.hit === false)).toBe(true);
  });

  it('preserves hit cells that are not scrolled out', () => {
    const s = makeStreak();
    s[13].hit = true;
    const result = advanceStreak(s, '2025-01-01', '2025-01-02');
    expect(result[12].hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// markTodayHit
// ---------------------------------------------------------------------------

describe('markTodayHit', () => {
  it('sets hit=true on the today cell', () => {
    const s = makeStreak();
    const result = markTodayHit(s);
    expect(result[13].hit).toBe(true);
    expect(result[13].today).toBe(true);
  });

  it('does not mutate other cells', () => {
    const s = makeStreak();
    const result = markTodayHit(s);
    expect(result.slice(0, 13).every(c => c.hit === false)).toBe(true);
  });

  it('is idempotent', () => {
    const s = makeStreak();
    expect(markTodayHit(markTodayHit(s))[13].hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// advanceDailyState
// ---------------------------------------------------------------------------

describe('advanceDailyState', () => {
  it('returns same state when dates are equal', () => {
    const s = makeState({ streakDate: '2025-01-01' });
    expect(advanceDailyState(s, '2025-01-01', '2025-01-01')).toBe(s);
  });

  it('resets goals done/count/minimum_done', () => {
    const s = makeState({ goalsCount: 2, streakDate: '2025-01-01' });
    const result = advanceDailyState(s, '2025-01-01', '2025-01-02');
    result.goals.forEach(g => {
      expect(g.done).toBe(false);
      expect(g.count).toBe(0);
      expect(g.minimum_done).toBe(false);
    });
  });

  it('resets items done/count', () => {
    const s = makeState({ itemsCount: 3, streakDate: '2025-01-01' });
    const result = advanceDailyState(s, '2025-01-01', '2025-01-02');
    result.groups[0].items.forEach(it => {
      expect(it.done).toBe(false);
      expect(it.count).toBe(0);
    });
  });

  it('updates streakDate', () => {
    const s = makeState({ streakDate: '2025-01-01' });
    expect(advanceDailyState(s, '2025-01-01', '2025-01-02').streakDate).toBe('2025-01-02');
  });
});

// ---------------------------------------------------------------------------
// calcNextNotif
// ---------------------------------------------------------------------------

describe('calcNextNotif', () => {
  const allDays  = [true,true,true,true,true,true,true];
  const weekdays = [true,true,true,true,true,false,false];

  it('returns — when times is empty', () => {
    expect(calcNextNotif([], allDays, { h: 8, m: 0, dow: 0 })).toBe('—');
  });

  it('returns — when all days are off', () => {
    const noDays = [false,false,false,false,false,false,false];
    expect(calcNextNotif(['07:00'], noDays, { h: 8, m: 0, dow: 0 })).toBe('—');
  });

  it('returns today label when time is still ahead', () => {
    expect(calcNextNotif(['07:00'], allDays, { h: 6, m: 0, dow: 0 })).toBe('今日 07:00（月）');
  });

  it('skips past times on today', () => {
    const result = calcNextNotif(['07:00', '22:00'], allDays, { h: 8, m: 0, dow: 0 });
    expect(result).toBe('今日 22:00（月）');
  });

  it('returns 明日 label when all today times are past', () => {
    expect(calcNextNotif(['07:00'], allDays, { h: 23, m: 0, dow: 0 })).toBe('明日 07:00（火）');
  });

  it('skips to next enabled day', () => {
    // Saturday (5) and Sunday (6) off → next is Monday (0)
    expect(calcNextNotif(['07:00'], weekdays, { h: 12, m: 0, dow: 5 })).toBe('月 07:00（月）');
  });
});

// ---------------------------------------------------------------------------
// sanitizeNotif
// ---------------------------------------------------------------------------

const DEF_NOTIF = { on: false, times: ['07:00'], days: [true,true,true,true,true,false,false] };

describe('sanitizeNotif', () => {
  it('returns default for null input', () => {
    expect(sanitizeNotif(null)).toEqual(DEF_NOTIF);
  });

  it('returns default for non-object input', () => {
    expect(sanitizeNotif('bad')).toEqual(DEF_NOTIF);
  });

  it('keeps valid HH:mm times', () => {
    const result = sanitizeNotif({ on: true, times: ['07:00', '22:30'], days: DEF_NOTIF.days });
    expect(result.times).toEqual(['07:00', '22:30']);
  });

  it('discards invalid time strings', () => {
    const result = sanitizeNotif({ on: true, times: ['99:99', 'bad', '07:00'], days: DEF_NOTIF.days });
    expect(result.times).toEqual(['07:00']);
  });

  it('falls back to default times when all are invalid', () => {
    const result = sanitizeNotif({ on: true, times: ['nope', '25:00'], days: DEF_NOTIF.days });
    expect(result.times).toEqual(DEF_NOTIF.times);
  });

  it('normalises on to boolean', () => {
    expect(sanitizeNotif({ on: 1,    times: ['07:00'], days: DEF_NOTIF.days }).on).toBe(false);
    expect(sanitizeNotif({ on: true, times: ['07:00'], days: DEF_NOTIF.days }).on).toBe(true);
  });

  it('falls back to default days when length is wrong', () => {
    const result = sanitizeNotif({ on: false, times: ['07:00'], days: [true, false] });
    expect(result.days).toEqual(DEF_NOTIF.days);
  });
});
