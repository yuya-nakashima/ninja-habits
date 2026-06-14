// Tests for application-layer use cases.
// All functions accept todayISO as a parameter so no fake timers are needed.
// Run: npm test  (vitest)

import { describe, it, expect } from 'vitest';
import {
  withTodayBase,
  applyGoalCreated,
  applyGoalDeleted,
  applyGoalLogResult,
  applyGoalMasterUpdated,
  applyGroupCreated,
  applyGroupDeleted,
  applyGroupMasterUpdated,
  applyItemCreated,
  applyItemDeleted,
  applyItemLogResult,
  applyItemMasterUpdated,
  applyNotifSaved,
  applySaveReflection,
  applyWishCategoryCreated,
  applyWishCategoryDeleted,
  applyWishCategoryUpdated,
  applyWishItemCreated,
  applyWishItemDeleted,
  applyWishItemUpdated,
} from './application';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStreak(n = 14) {
  return Array.from({ length: n }, (_, i) => ({
    label: '月', hit: false, today: i === n - 1,
  }));
}

// State as of '2025-01-01' with done/count from a previous day.
function makeYesterdayState() {
  return {
    streakDate: '2025-01-01',
    streak: makeStreak(),
    goals: [
      { id: 'g1', content: 'Run',  done: true,  count: 2, minimum_done: true,  minimum_goal: null },
      { id: 'g2', content: 'Read', done: false, count: 0, minimum_done: true,  minimum_goal: null },
    ],
    groups: [{
      id: 'grp1', name: 'Morning',
      woop_wish: null, woop_outcome: null, woop_obstacle: null, woop_plan: null,
      items: [
        { id: 'it1', content: 'Water', done: true,  count: 1,
          notif: { on: false, times: ['07:00'], days: [true,true,true,true,true,false,false] } },
        { id: 'it2', content: 'Yoga',  done: false, count: 0,
          notif: { on: false, times: ['07:00'], days: [true,true,true,true,true,false,false] } },
      ],
    }],
    history: [],
    wishes: [],
  };
}

const TODAY     = '2025-01-01'; // same day — no rollover
const TOMORROW  = '2025-01-02'; // next day — triggers rollover

// ---------------------------------------------------------------------------
// withTodayBase
// ---------------------------------------------------------------------------

describe('withTodayBase', () => {
  it('returns same state when streakDate equals todayISO', () => {
    const s = makeYesterdayState();
    expect(withTodayBase(s, TODAY)).toBe(s);
  });

  it('resets goals done/count/minimum_done on date advance', () => {
    const result = withTodayBase(makeYesterdayState(), TOMORROW);
    result.goals.forEach(g => {
      expect(g.done).toBe(false);
      expect(g.count).toBe(0);
      expect(g.minimum_done).toBe(false);
    });
  });

  it('resets items done/count on date advance', () => {
    const result = withTodayBase(makeYesterdayState(), TOMORROW);
    result.groups[0].items.forEach(it => {
      expect(it.done).toBe(false);
      expect(it.count).toBe(0);
    });
  });

  it('updates streakDate to todayISO', () => {
    expect(withTodayBase(makeYesterdayState(), TOMORROW).streakDate).toBe(TOMORROW);
  });
});

// ---------------------------------------------------------------------------
// Goal master results
// ---------------------------------------------------------------------------

describe('applyGoalCreated', () => {
  it('appends a fresh goal with no log', () => {
    const master = { id: 'g3', content: 'New', minimum_goal: null, is_active: true, version: 1 };
    const result = applyGoalCreated(makeYesterdayState(), master);
    expect(result.goals).toHaveLength(3);
    expect(result.goals[2]).toEqual({
      id: 'g3', content: 'New', minimum_goal: null,
      done: false, minimum_done: false, count: 0,
      version: 1, log_version: null,
    });
  });
});

describe('applyGoalMasterUpdated', () => {
  it('updates content, minimum_goal and version while keeping log state', () => {
    const master = { id: 'g1', content: 'Run far', minimum_goal: 'Walk', is_active: true, version: 2 };
    const result = applyGoalMasterUpdated(makeYesterdayState(), master);
    const goal = result.goals.find(g => g.id === 'g1')!;
    expect(goal.content).toBe('Run far');
    expect(goal.minimum_goal).toBe('Walk');
    expect(goal.version).toBe(2);
    expect(goal.done).toBe(true); // 日次ログ状態は維持
  });

  it('removes the goal when deactivated', () => {
    const master = { id: 'g1', content: 'Run', minimum_goal: null, is_active: false, version: 2 };
    const result = applyGoalMasterUpdated(makeYesterdayState(), master);
    expect(result.goals.map(g => g.id)).toEqual(['g2']);
  });
});

describe('applyGoalDeleted', () => {
  it('removes the goal from state', () => {
    const result = applyGoalDeleted(makeYesterdayState(), 'g2');
    expect(result.goals.map(g => g.id)).toEqual(['g1']);
  });
});

// ---------------------------------------------------------------------------
// Habit group / item / notification results
// ---------------------------------------------------------------------------

describe('habit master apply functions', () => {
  const groupMaster = {
    id: 'grp2', name: '夜の習慣',
    woop_wish: null, woop_outcome: null, woop_obstacle: null, woop_plan: null,
    is_active: true, version: 1,
  };

  it('applyGroupCreated appends an empty group', () => {
    const result = applyGroupCreated(makeYesterdayState(), groupMaster);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[1]).toMatchObject({ id: 'grp2', name: '夜の習慣', items: [], version: 1 });
  });

  it('applyGroupMasterUpdated updates name/woop/version and keeps items', () => {
    const result = applyGroupMasterUpdated(makeYesterdayState(), {
      ...groupMaster, id: 'grp1', name: '朝のルーティン', woop_wish: '整える', version: 2,
    });
    const group = result.groups[0];
    expect(group.name).toBe('朝のルーティン');
    expect(group.woop_wish).toBe('整える');
    expect(group.version).toBe(2);
    expect(group.items).toHaveLength(2);
  });

  it('applyGroupMasterUpdated removes a deactivated group', () => {
    const result = applyGroupMasterUpdated(makeYesterdayState(), { ...groupMaster, id: 'grp1', is_active: false });
    expect(result.groups).toHaveLength(0);
  });

  it('applyGroupDeleted removes the group', () => {
    expect(applyGroupDeleted(makeYesterdayState(), 'grp1').groups).toHaveLength(0);
  });

  it('applyItemCreated appends a fresh item with default notif', () => {
    const result = applyItemCreated(makeYesterdayState(), {
      id: 'it3', group_id: 'grp1', content: 'Stretch', is_active: true, version: 1,
    });
    const item = result.groups[0].items[2];
    expect(item).toMatchObject({
      id: 'it3', content: 'Stretch', done: false, count: 0, version: 1, log_version: null,
    });
    expect(item.notif).toEqual({ on: false, times: ['07:00'], days: [true, true, true, true, true, false, false], version: null });
  });

  it('applyItemMasterUpdated updates content/version and keeps log state', () => {
    const result = applyItemMasterUpdated(makeYesterdayState(), 'grp1', {
      id: 'it1', group_id: 'grp1', content: 'Water 300ml', is_active: true, version: 2,
    });
    const item = result.groups[0].items[0];
    expect(item.content).toBe('Water 300ml');
    expect(item.version).toBe(2);
    expect(item.done).toBe(true);
  });

  it('applyItemMasterUpdated removes a deactivated item', () => {
    const result = applyItemMasterUpdated(makeYesterdayState(), 'grp1', {
      id: 'it1', group_id: 'grp1', content: 'Water', is_active: false, version: 2,
    });
    expect(result.groups[0].items.map(it => it.id)).toEqual(['it2']);
  });

  it('applyItemDeleted removes the item', () => {
    const result = applyItemDeleted(makeYesterdayState(), 'grp1', 'it2');
    expect(result.groups[0].items.map(it => it.id)).toEqual(['it1']);
  });

  it('applyNotifSaved replaces notif including version', () => {
    const saved = { on: true, times: ['08:00'], days: [false, false, false, false, false, true, true], version: 3 };
    const result = applyNotifSaved(makeYesterdayState(), 'grp1', 'it1', saved);
    expect(result.groups[0].items[0].notif).toEqual(saved);
  });
});

// ---------------------------------------------------------------------------
// Wish List results
// ---------------------------------------------------------------------------

describe('wish apply functions', () => {
  function stateWithWishes() {
    return {
      ...makeYesterdayState(),
      wishes: [
        { id: 'cat1', name: '読みたい本', version: 1, items: [
          { id: 'w1', content: 'アトミック・ハビット', version: 1 },
        ] },
      ],
    };
  }

  it('applyWishCategoryCreated appends an empty category', () => {
    const result = applyWishCategoryCreated(stateWithWishes(), { id: 'cat2', name: '行きたい場所', version: 1 });
    expect(result.wishes).toHaveLength(2);
    expect(result.wishes[1]).toEqual({ id: 'cat2', name: '行きたい場所', version: 1, items: [] });
  });

  it('applyWishCategoryUpdated updates name/version, keeps items', () => {
    const result = applyWishCategoryUpdated(stateWithWishes(), { id: 'cat1', name: '読んだ本', version: 2 });
    expect(result.wishes[0].name).toBe('読んだ本');
    expect(result.wishes[0].version).toBe(2);
    expect(result.wishes[0].items).toHaveLength(1);
  });

  it('applyWishCategoryDeleted removes the category', () => {
    expect(applyWishCategoryDeleted(stateWithWishes(), 'cat1').wishes).toHaveLength(0);
  });

  it('applyWishItemCreated appends an item to the category', () => {
    const result = applyWishItemCreated(stateWithWishes(), { id: 'w2', category_id: 'cat1', content: '7つの習慣', version: 1 });
    expect(result.wishes[0].items.map(i => i.id)).toEqual(['w1', 'w2']);
  });

  it('applyWishItemUpdated updates content/version', () => {
    const result = applyWishItemUpdated(stateWithWishes(), 'cat1', { id: 'w1', category_id: 'cat1', content: '再読', version: 2 });
    expect(result.wishes[0].items[0]).toEqual({ id: 'w1', content: '再読', version: 2 });
  });

  it('applyWishItemDeleted removes the item', () => {
    expect(applyWishItemDeleted(stateWithWishes(), 'cat1', 'w1').wishes[0].items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyGoalLogResult
// ---------------------------------------------------------------------------

describe('applyGoalLogResult', () => {
  it('applies done/count/minimum_done and log_version from the API result', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g2',
      { done: true, count: 1, minimum_done: true, version: 1 }, TODAY);
    const goal = result.goals.find(g => g.id === 'g2')!;
    expect(goal.done).toBe(true);
    expect(goal.count).toBe(1);
    expect(goal.minimum_done).toBe(true);
    expect(goal.log_version).toBe(1);
  });

  it('marks streak hit when done', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g2',
      { done: true, count: 1, minimum_done: false, version: 1 }, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(true);
  });

  it('marks streak hit when only minimum_done', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g2',
      { done: false, count: 0, minimum_done: true, version: 1 }, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(true);
  });

  it('does not mark streak hit when neither done nor minimum_done', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g2',
      { done: false, count: 0, minimum_done: false, version: 2 }, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(false);
  });

  it('does not touch other goals', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g2',
      { done: true, count: 1, minimum_done: false, version: 1 }, TODAY);
    expect(result.goals.find(g => g.id === 'g1')!.log_version).toBeUndefined();
  });

  it('applies rollover first when date has advanced', () => {
    const result = applyGoalLogResult(makeYesterdayState(), 'g1',
      { done: true, count: 1, minimum_done: false, version: 1 }, TOMORROW);
    expect(result.streakDate).toBe(TOMORROW);
    expect(result.goals.find(g => g.id === 'g1')!.done).toBe(true);
    // g2 reset by rollover
    expect(result.goals.find(g => g.id === 'g2')!.minimum_done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyItemLogResult
// ---------------------------------------------------------------------------

describe('applyItemLogResult', () => {
  it('applies done/count and log_version from the API result', () => {
    const result = applyItemLogResult(makeYesterdayState(), 'grp1', 'it2',
      { done: true, count: 1, version: 1 }, TODAY);
    const item = result.groups[0].items.find(it => it.id === 'it2')!;
    expect(item.done).toBe(true);
    expect(item.count).toBe(1);
    expect(item.log_version).toBe(1);
  });

  it('marks streak hit when done', () => {
    const result = applyItemLogResult(makeYesterdayState(), 'grp1', 'it2',
      { done: true, count: 1, version: 1 }, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(true);
  });

  it('does not mark streak hit when unchecking', () => {
    const result = applyItemLogResult(makeYesterdayState(), 'grp1', 'it1',
      { done: false, count: 0, version: 2 }, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(false);
  });

  it('applies rollover first when date has advanced', () => {
    const result = applyItemLogResult(makeYesterdayState(), 'grp1', 'it1',
      { done: true, count: 1, version: 1 }, TOMORROW);
    expect(result.streakDate).toBe(TOMORROW);
    expect(result.groups[0].items.find(it => it.id === 'it1')!.done).toBe(true);
    // it2 reset by rollover
    expect(result.groups[0].items.find(it => it.id === 'it2')!.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applySaveReflection
// ---------------------------------------------------------------------------

describe('applySaveReflection', () => {
  const payload = { free_text: 'good day', want_to_do: null, unconscious_desire: null };

  it('adds a new reflection entry for today', () => {
    const s = { ...makeYesterdayState(), history: [] };
    const result = applySaveReflection(s, payload, TODAY);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].day).toBe(TODAY);
    expect(result.history[0].free_text).toBe('good day');
  });

  it('merges into an existing entry for the same day', () => {
    const s = { ...makeYesterdayState(), history: [{ day: TODAY, free_text: 'old', want_to_do: null, unconscious_desire: null }] };
    const result = applySaveReflection(s, { free_text: 'updated', want_to_do: null, unconscious_desire: null }, TODAY);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].free_text).toBe('updated');
  });

  it('marks streak hit', () => {
    const result = applySaveReflection({ ...makeYesterdayState(), history: [] }, payload, TODAY);
    expect(result.streak.find(c => c.today)!.hit).toBe(true);
  });

  it('applies rollover before saving when date has advanced', () => {
    const s = { ...makeYesterdayState(), history: [] };
    const result = applySaveReflection(s, payload, TOMORROW);
    expect(result.streakDate).toBe(TOMORROW);
    // goals reset by rollover
    result.goals.forEach(g => expect(g.done).toBe(false));
  });
});
