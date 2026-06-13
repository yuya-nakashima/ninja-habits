// AppState migration — sanitize nested shapes from old/corrupt data.

import { createId, getTodayISO } from './infrastructure';
import type { AppState, Goal, HabitGroup, HabitItem, HistoryEntry, NotifSettings, StreakCell, WishCategory } from './types';
import { DEMO_GOALS, DEMO_GROUPS, DEMO_STREAK, DEMO_WISHES, DEMO_HISTORY } from './data';

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function sanitizeNotif(n: unknown): NotifSettings {
  const def: NotifSettings = { on: false, times: ['07:00'], days: [true,true,true,true,true,false,false] };
  if (!n || typeof n !== 'object' || Array.isArray(n)) return def;
  const obj = n as Record<string, unknown>;
  const validTimes = Array.isArray(obj['times'])
    ? (obj['times'] as unknown[]).filter((t): t is string => typeof t === 'string' && HH_MM_RE.test(t))
    : [];
  return {
    on:    obj['on'] === true,
    times: validTimes.length > 0 ? validTimes : def.times,
    days:  Array.isArray(obj['days']) && obj['days'].length === 7
           ? (obj['days'] as unknown[]).map(d => Boolean(d))
           : def.days,
  };
}

export function sanitizeItem(it: unknown): HabitItem | null {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
  const obj = it as Record<string, unknown>;
  if (typeof obj['content'] !== 'string') return null;
  return {
    id:      obj['id'] != null ? String(obj['id']) : createId(),
    content: obj['content'],
    done:    obj['done']  === true,
    count:   typeof obj['count'] === 'number' ? obj['count'] : 0,
    notif:   sanitizeNotif(obj['notif']),
  };
}

export function sanitizeGoal(g: unknown): Goal | null {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const obj = g as Record<string, unknown>;
  if (typeof obj['content'] !== 'string') return null;
  return {
    id:           obj['id'] != null ? String(obj['id']) : createId(),
    content:      obj['content'],
    minimum_goal: typeof obj['minimum_goal'] === 'string' ? obj['minimum_goal'] : null,
    done:         obj['done']         === true,
    minimum_done: obj['minimum_done'] === true,
    count:        typeof obj['count'] === 'number' ? obj['count'] : 0,
  };
}

export function sanitizeGroup(g: unknown): HabitGroup | null {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const obj = g as Record<string, unknown>;
  if (typeof obj['name'] !== 'string') return null;
  return {
    id:            obj['id'] != null ? String(obj['id']) : createId(),
    name:          obj['name'],
    woop_wish:     typeof obj['woop_wish']     === 'string' ? obj['woop_wish']     : null,
    woop_outcome:  typeof obj['woop_outcome']  === 'string' ? obj['woop_outcome']  : null,
    woop_obstacle: typeof obj['woop_obstacle'] === 'string' ? obj['woop_obstacle'] : null,
    woop_plan:     typeof obj['woop_plan']     === 'string' ? obj['woop_plan']     : null,
    items: Array.isArray(obj['items'])
      ? (obj['items'] as unknown[]).map(sanitizeItem).filter((it): it is HabitItem => it !== null)
      : [],
  };
}

export function sanitizeStreakCell(d: unknown): StreakCell {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { label: '?', hit: false, today: false };
  const obj = d as Record<string, unknown>;
  return {
    label: typeof obj['label'] === 'string' ? obj['label'] : '?',
    hit:   obj['hit']   === true,
    today: obj['today'] === true,
  };
}

export function sanitizeWishCat(c: unknown): WishCategory | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const obj = c as Record<string, unknown>;
  if (typeof obj['name'] !== 'string') return null;
  const items = Array.isArray(obj['items'])
    ? (obj['items'] as unknown[])
        .filter((it): it is Record<string, unknown> =>
          !!it && typeof it === 'object' && !Array.isArray(it) &&
          typeof (it as Record<string, unknown>)['content'] === 'string')
        .map(it => ({ id: it['id'] != null ? String(it['id']) : createId(), content: it['content'] as string }))
    : [];
  return { id: obj['id'] != null ? String(obj['id']) : createId(), name: obj['name'], items };
}

export function sanitizeHistoryEntry(r: unknown): HistoryEntry | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const obj = r as Record<string, unknown>;
  if (typeof obj['day'] !== 'string') return null;
  return {
    day:                obj['day'],
    free_text:          typeof obj['free_text']          === 'string' ? obj['free_text']          : null,
    want_to_do:         typeof obj['want_to_do']         === 'string' ? obj['want_to_do']         : null,
    unconscious_desire: typeof obj['unconscious_desire'] === 'string' ? obj['unconscious_desire'] : null,
  };
}

// ---------------------------------------------------------------------------
// State initialization
// ---------------------------------------------------------------------------

export function defaultState(): AppState {
  return {
    goals:      DEMO_GOALS,
    groups:     DEMO_GROUPS,
    streak:     DEMO_STREAK,
    wishes:     DEMO_WISHES,
    history:    DEMO_HISTORY,
    streakDate: getTodayISO(),
  };
}
