import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiConflictError, createGoal, createHabitGroup, createWishCategory, deleteGoal, deleteWishItem,
  fetchReflections, mapTodayResponse, saveGoalLog, saveHabitItemLog, saveNotification, saveReflection,
  updateGoal, updateHabitItem, updateWishItem,
} from './apiClient';
import type { ApiTodayResponse } from './apiClient';
import type { AuthSession } from './auth';

describe('mapTodayResponse', () => {
  it('maps GET /v1/today response into AppState', () => {
    const response: ApiTodayResponse = {
      date: '2026-06-09',
      goals: [{
        id: 'goal_1',
        content: 'Run',
        minimum_goal: 'Walk',
        done: true,
        minimum_done: true,
        count: 1,
        version: 2,
        log_version: 9,
      }],
      groups: [{
        id: 'group_1',
        name: 'Morning',
        woop_wish: null,
        woop_outcome: null,
        woop_obstacle: null,
        woop_plan: null,
        version: 3,
        items: [{
          id: 'item_1',
          content: 'Water',
          done: false,
          count: 0,
          version: 4,
          log_version: null,
          notif: {
            on: true,
            times: ['07:00'],
            days: [true, true, true, true, true, false, false],
            version: 5,
          },
        }],
      }],
      streak: [{ label: '火', hit: true, today: true }],
      wishes: [{
        id: 'cat_1',
        name: 'Books',
        version: 6,
        items: [{ id: 'wish_1', content: 'Book', version: 7 }],
      }],
      history: [{
        date: '2026-06-08',
        free_text: 'Good',
        want_to_do: null,
        unconscious_desire: 'Rest',
        version: 8,
      }],
    };

    const state = mapTodayResponse(response);

    expect(state.streakDate).toBe('2026-06-09');
    expect(state.goals[0].version).toBe(2);
    expect(state.goals[0].log_version).toBe(9);
    expect(state.groups[0].items[0].log_version).toBeNull();
    expect(state.groups[0].items[0].notif.version).toBe(5);
    expect(state.wishes[0].items[0].version).toBe(7);
    expect(state.history[0]).toEqual({
      day: '2026-06-08',
      free_text: 'Good',
      want_to_do: null,
      unconscious_desire: 'Rest',
      version: 8,
    });
  });
});

describe('saveReflection', () => {
  const config = { baseUrl: 'http://api.example' };
  const session: AuthSession = {
    accessToken: 'token',
    devSub: 'dev-1',
    email: 'dev@example.com',
    expiresAt: 0,
    idToken: 'id-token',
    refreshToken: null,
  };
  const payload = { free_text: 'Good', want_to_do: null, unconscious_desire: null };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('PUTs the reflection and maps the response to a HistoryEntry', async () => {
    const fetchMock = stubFetch(200, {
      date: '2026-06-11', free_text: 'Good', want_to_do: null, unconscious_desire: null, version: 1,
    });

    const entry = await saveReflection(config, session, '2026-06-11', payload);

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/reflections/2026-06-11', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(payload);
    expect(entry).toEqual({
      day: '2026-06-11', free_text: 'Good', want_to_do: null, unconscious_desire: null, version: 1,
    });
  });

  it('includes version in the body only when updating', async () => {
    const fetchMock = stubFetch(200, {
      date: '2026-06-11', free_text: 'Good', want_to_do: null, unconscious_desire: null, version: 3,
    });

    await saveReflection(config, session, '2026-06-11', { ...payload, version: 2 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ ...payload, version: 2 });
  });

  it('throws ApiConflictError on 409', async () => {
    stubFetch(409, { error: { code: 'conflict', message: 'conflict' } });

    await expect(saveReflection(config, session, '2026-06-11', payload)).rejects.toBeInstanceOf(ApiConflictError);
  });

  it('throws a plain error on other failures', async () => {
    stubFetch(422, { error: { code: 'validation_error', message: 'bad' } });

    await expect(saveReflection(config, session, '2026-06-11', payload)).rejects.toThrow('422');
  });

  it('fetches reflections and maps date -> day', async () => {
    const fetchMock = stubFetch(200, {
      reflections: [
        { date: '2026-06-10', free_text: 'X', want_to_do: null, unconscious_desire: null, version: 1 },
        { date: '2026-06-09', free_text: null, want_to_do: 'Y', unconscious_desire: null, version: 2 },
      ],
    });

    const list = await fetchReflections(config, session, { from: '2026-06-01', to: '2026-06-10' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/v1/reflections?from=2026-06-01&to=2026-06-10',
      expect.objectContaining({ headers: expect.anything() }),
    );
    expect(list).toEqual([
      { day: '2026-06-10', free_text: 'X', want_to_do: null, unconscious_desire: null, version: 1 },
      { day: '2026-06-09', free_text: null, want_to_do: 'Y', unconscious_desire: null, version: 2 },
    ]);
  });

  it('omits query params when no range is given', async () => {
    const fetchMock = stubFetch(200, { reflections: [] });

    await fetchReflections(config, session);

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/reflections', expect.anything());
  });
});

describe('saveGoalLog / saveHabitItemLog', () => {
  const config = { baseUrl: 'http://api.example' };
  const session: AuthSession = {
    accessToken: 'token',
    devSub: 'dev-1',
    email: 'dev@example.com',
    expiresAt: 0,
    idToken: 'id-token',
    refreshToken: null,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('PUTs a goal log and returns the result', async () => {
    const fetchMock = stubFetch(200, { date: '2026-06-11', done: true, count: 1, minimum_done: true, version: 1 });

    const log = await saveGoalLog(config, session, '2026-06-11', 'goal-uuid', { done: true, count: 1, minimum_done: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/v1/daily-logs/2026-06-11/goals/goal-uuid',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ done: true, count: 1, minimum_done: true });
    expect(log.version).toBe(1);
  });

  it('includes version when updating a habit item log', async () => {
    const fetchMock = stubFetch(200, { date: '2026-06-11', done: false, count: 0, version: 3 });

    await saveHabitItemLog(config, session, '2026-06-11', 'item-uuid', { done: false, count: 0, version: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/v1/daily-logs/2026-06-11/habit-items/item-uuid',
      expect.anything(),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ done: false, count: 0, version: 2 });
  });

  it('throws ApiConflictError on 409', async () => {
    stubFetch(409, { error: { code: 'conflict', message: 'conflict' } });

    await expect(saveGoalLog(config, session, '2026-06-11', 'goal-uuid', { done: true, count: 1, minimum_done: false }))
      .rejects.toBeInstanceOf(ApiConflictError);
  });

  it('throws a plain error on other failures', async () => {
    stubFetch(404, { error: { code: 'not_found', message: 'missing' } });

    await expect(saveHabitItemLog(config, session, '2026-06-11', 'item-uuid', { done: true, count: 1 }))
      .rejects.toThrow('404');
  });
});

describe('goal master client', () => {
  const config = { baseUrl: 'http://api.example' };
  const session: AuthSession = {
    accessToken: 'token',
    devSub: 'dev-1',
    email: 'dev@example.com',
    expiresAt: 0,
    idToken: 'id-token',
    refreshToken: null,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('POSTs a new goal', async () => {
    const master = { id: 'goal-uuid', content: 'Run', minimum_goal: null, is_active: true, sort_order: 1, version: 1 };
    const fetchMock = stubFetch(201, master);

    const created = await createGoal(config, session, { content: 'Run', minimum_goal: null });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/goals', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ content: 'Run', minimum_goal: null });
    expect(created).toEqual(master);
  });

  it('PATCHes only the provided fields plus version', async () => {
    const fetchMock = stubFetch(200, { id: 'goal-uuid', content: 'Run more', minimum_goal: null, is_active: true, version: 2 });

    await updateGoal(config, session, 'goal-uuid', { content: 'Run more', version: 1 });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/goals/goal-uuid', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ content: 'Run more', version: 1 });
  });

  it('DELETEs without a body and accepts 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteGoal(config, session, 'goal-uuid')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/goals/goal-uuid', expect.objectContaining({ method: 'DELETE' }));
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('throws ApiConflictError on 409', async () => {
    stubFetch(409, { error: { code: 'conflict', message: 'conflict' } });

    await expect(updateGoal(config, session, 'goal-uuid', { content: 'x', version: 1 }))
      .rejects.toBeInstanceOf(ApiConflictError);
  });

  it('POSTs a new habit group', async () => {
    const master = {
      id: 'grp-uuid', name: '朝の習慣',
      woop_wish: null, woop_outcome: null, woop_obstacle: null, woop_plan: null,
      is_active: true, sort_order: 1, version: 1,
    };
    const fetchMock = stubFetch(201, master);

    const created = await createHabitGroup(config, session, { name: '朝の習慣' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/habit-groups', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ name: '朝の習慣' });
    expect(created).toEqual(master);
  });

  it('PATCHes a habit item with only provided fields', async () => {
    const fetchMock = stubFetch(200, { id: 'item-uuid', group_id: 'grp-uuid', content: 'Water', is_active: true, version: 2 });

    await updateHabitItem(config, session, 'item-uuid', { content: 'Water', version: 1 });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/habit-items/item-uuid', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ content: 'Water', version: 1 });
  });

  it('PUTs a notification, omitting version for first save', async () => {
    const payload = { on: true, times: ['07:00'], days: [true, true, true, true, true, false, false] };
    const fetchMock = stubFetch(200, { ...payload, version: 1 });

    const saved = await saveNotification(config, session, 'item-uuid', payload);

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/habit-items/item-uuid/notification', expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(payload);
    expect(saved.version).toBe(1);
  });

  it('PUTs a notification with version when updating', async () => {
    const payload = { on: false, times: ['08:00'], days: [true, true, true, true, true, false, false], version: 2 };
    const fetchMock = stubFetch(200, { ...payload, version: 3 });

    await saveNotification(config, session, 'item-uuid', payload);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(payload);
  });

  it('POSTs a new wish category', async () => {
    const master = { id: 'cat-uuid', name: '読みたい本', sort_order: 1, version: 1 };
    const fetchMock = stubFetch(201, master);

    const created = await createWishCategory(config, session, { name: '読みたい本' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/wish-categories', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ name: '読みたい本' });
    expect(created).toEqual(master);
  });

  it('PATCHes a wish item with content + version', async () => {
    const fetchMock = stubFetch(200, { id: 'item-uuid', category_id: 'cat-uuid', content: '再読', version: 2 });

    await updateWishItem(config, session, 'item-uuid', { content: '再読', version: 1 });

    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/wish-items/item-uuid', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ content: '再読', version: 1 });
  });

  it('DELETEs a wish item and accepts 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteWishItem(config, session, 'item-uuid')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://api.example/v1/wish-items/item-uuid', expect.objectContaining({ method: 'DELETE' }));
  });
});
