import type { AuthSession } from './auth';
import type {
  AppState, DailyLogResult, Goal, GoalCreatePayload, GoalLogPayload, GoalMaster, GoalUpdatePayload,
  HabitGroup, HabitGroupCreatePayload, HabitGroupMaster, HabitGroupUpdatePayload,
  HabitItemCreatePayload, HabitItemLogPayload, HabitItemMaster, HabitItemUpdatePayload,
  HistoryEntry, NotificationPayload, NotificationResult, ReflectionPayload, StreakCell, WishCategory,
} from './types';

export interface ApiConfig {
  baseUrl: string;
}

interface ApiNotif {
  on: boolean;
  times: string[];
  days: boolean[];
  version: number | null;
}

interface ApiHabitItem {
  id: string;
  content: string;
  done: boolean;
  count: number;
  version: number;
  log_version: number | null;
  notif: ApiNotif;
}

interface ApiHabitGroup {
  id: string;
  name: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  version: number;
  items: ApiHabitItem[];
}

interface ApiGoal {
  id: string;
  content: string;
  minimum_goal: string | null;
  done: boolean;
  minimum_done: boolean;
  count: number;
  version: number;
  log_version: number | null;
}

interface ApiWishItem {
  id: string;
  content: string;
  version: number;
}

interface ApiWishCategory {
  id: string;
  name: string;
  version: number;
  items: ApiWishItem[];
}

interface ApiHistoryEntry {
  date: string;
  free_text: string | null;
  want_to_do: string | null;
  unconscious_desire: string | null;
  version: number;
}

export interface ApiTodayResponse {
  date: string;
  goals: ApiGoal[];
  groups: ApiHabitGroup[];
  streak: StreakCell[];
  wishes: ApiWishCategory[];
  history: ApiHistoryEntry[];
}

export function getApiConfig(): ApiConfig | null {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, '') };
}

export async function fetchTodayState(config: ApiConfig, session: AuthSession, date?: string): Promise<AppState> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const query = params.size > 0 ? `?${params.toString()}` : '';

  const response = await fetch(`${config.baseUrl}/v1/today${query}`, {
    headers: buildAuthHeaders(session),
  });

  if (!response.ok) {
    throw new Error(`Failed to load today state: ${response.status}`);
  }

  return mapTodayResponse(await response.json() as ApiTodayResponse);
}

/** 楽観ロック失敗（409）。最新データを再取得してから再試行する。 */
export class ApiConflictError extends Error {
  constructor() {
    super('conflict');
    this.name = 'ApiConflictError';
  }
}

async function requestJson(
  config: ApiConfig,
  session: AuthSession,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      ...buildAuthHeaders(session),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 409) throw new ApiConflictError();
  if (!response.ok) throw new Error(`Failed to save ${path}: ${response.status}`);

  return response.status === 204 ? null : response.json();
}

function putJson(config: ApiConfig, session: AuthSession, path: string, body: Record<string, unknown>): Promise<unknown> {
  return requestJson(config, session, 'PUT', path, body);
}

export async function saveReflection(
  config: ApiConfig,
  session: AuthSession,
  date: string,
  payload: ReflectionPayload,
): Promise<HistoryEntry> {
  const body: Record<string, unknown> = {
    free_text: payload.free_text,
    want_to_do: payload.want_to_do,
    unconscious_desire: payload.unconscious_desire,
  };
  if (payload.version !== undefined) body.version = payload.version;

  const response = await putJson(config, session, `/v1/reflections/${date}`, body);
  return mapHistoryEntry(response as ApiHistoryEntry);
}

export async function saveGoalLog(
  config: ApiConfig,
  session: AuthSession,
  date: string,
  goalId: string,
  payload: GoalLogPayload,
): Promise<DailyLogResult> {
  const body: Record<string, unknown> = {
    done: payload.done,
    count: payload.count,
    minimum_done: payload.minimum_done,
  };
  if (payload.version !== undefined) body.version = payload.version;

  return await putJson(config, session, `/v1/daily-logs/${date}/goals/${goalId}`, body) as DailyLogResult;
}

export async function saveHabitItemLog(
  config: ApiConfig,
  session: AuthSession,
  date: string,
  habitItemId: string,
  payload: HabitItemLogPayload,
): Promise<DailyLogResult> {
  const body: Record<string, unknown> = {
    done: payload.done,
    count: payload.count,
  };
  if (payload.version !== undefined) body.version = payload.version;

  return await putJson(config, session, `/v1/daily-logs/${date}/habit-items/${habitItemId}`, body) as DailyLogResult;
}

export async function createGoal(config: ApiConfig, session: AuthSession, payload: GoalCreatePayload): Promise<GoalMaster> {
  return await requestJson(config, session, 'POST', '/v1/goals', {
    content: payload.content,
    minimum_goal: payload.minimum_goal,
  }) as GoalMaster;
}

export async function updateGoal(config: ApiConfig, session: AuthSession, goalId: string, payload: GoalUpdatePayload): Promise<GoalMaster> {
  const body: Record<string, unknown> = { version: payload.version };
  if (payload.content !== undefined) body.content = payload.content;
  if (payload.minimum_goal !== undefined) body.minimum_goal = payload.minimum_goal;
  if (payload.is_active !== undefined) body.is_active = payload.is_active;

  return await requestJson(config, session, 'PATCH', `/v1/goals/${goalId}`, body) as GoalMaster;
}

export async function deleteGoal(config: ApiConfig, session: AuthSession, goalId: string): Promise<void> {
  await requestJson(config, session, 'DELETE', `/v1/goals/${goalId}`);
}

export async function createHabitGroup(config: ApiConfig, session: AuthSession, payload: HabitGroupCreatePayload): Promise<HabitGroupMaster> {
  return await requestJson(config, session, 'POST', '/v1/habit-groups', { name: payload.name }) as HabitGroupMaster;
}

export async function updateHabitGroup(config: ApiConfig, session: AuthSession, groupId: string, payload: HabitGroupUpdatePayload): Promise<HabitGroupMaster> {
  const body: Record<string, unknown> = { version: payload.version };
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.woop_wish !== undefined) body.woop_wish = payload.woop_wish;
  if (payload.woop_outcome !== undefined) body.woop_outcome = payload.woop_outcome;
  if (payload.woop_obstacle !== undefined) body.woop_obstacle = payload.woop_obstacle;
  if (payload.woop_plan !== undefined) body.woop_plan = payload.woop_plan;
  if (payload.is_active !== undefined) body.is_active = payload.is_active;

  return await requestJson(config, session, 'PATCH', `/v1/habit-groups/${groupId}`, body) as HabitGroupMaster;
}

export async function deleteHabitGroup(config: ApiConfig, session: AuthSession, groupId: string): Promise<void> {
  await requestJson(config, session, 'DELETE', `/v1/habit-groups/${groupId}`);
}

export async function createHabitItem(config: ApiConfig, session: AuthSession, groupId: string, payload: HabitItemCreatePayload): Promise<HabitItemMaster> {
  return await requestJson(config, session, 'POST', `/v1/habit-groups/${groupId}/items`, { content: payload.content }) as HabitItemMaster;
}

export async function updateHabitItem(config: ApiConfig, session: AuthSession, itemId: string, payload: HabitItemUpdatePayload): Promise<HabitItemMaster> {
  const body: Record<string, unknown> = { version: payload.version };
  if (payload.content !== undefined) body.content = payload.content;
  if (payload.is_active !== undefined) body.is_active = payload.is_active;

  return await requestJson(config, session, 'PATCH', `/v1/habit-items/${itemId}`, body) as HabitItemMaster;
}

export async function deleteHabitItem(config: ApiConfig, session: AuthSession, itemId: string): Promise<void> {
  await requestJson(config, session, 'DELETE', `/v1/habit-items/${itemId}`);
}

export async function saveNotification(config: ApiConfig, session: AuthSession, itemId: string, payload: NotificationPayload): Promise<NotificationResult> {
  const body: Record<string, unknown> = {
    on: payload.on,
    times: payload.times,
    days: payload.days,
  };
  if (payload.version !== undefined) body.version = payload.version;

  return await requestJson(config, session, 'PUT', `/v1/habit-items/${itemId}/notification`, body) as NotificationResult;
}

function buildAuthHeaders(session: AuthSession): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/json',
  };

  if (session.devSub) {
    headers['x-dev-cognito-sub'] = session.devSub;
    if (session.email) headers['x-dev-email'] = session.email;
  }

  return headers;
}

export function mapTodayResponse(response: ApiTodayResponse): AppState {
  return {
    goals: response.goals.map(mapGoal),
    groups: response.groups.map(mapGroup),
    streak: response.streak,
    wishes: response.wishes.map(mapWishCategory),
    history: response.history.map(mapHistoryEntry),
    streakDate: response.date,
  };
}

function mapGoal(goal: ApiGoal): Goal {
  return { ...goal };
}

function mapGroup(group: ApiHabitGroup): HabitGroup {
  return {
    id: group.id,
    name: group.name,
    woop_wish: group.woop_wish,
    woop_outcome: group.woop_outcome,
    woop_obstacle: group.woop_obstacle,
    woop_plan: group.woop_plan,
    version: group.version,
    items: group.items.map(item => ({
      id: item.id,
      content: item.content,
      done: item.done,
      count: item.count,
      version: item.version,
      log_version: item.log_version,
      notif: item.notif,
    })),
  };
}

function mapWishCategory(category: ApiWishCategory): WishCategory {
  return {
    id: category.id,
    name: category.name,
    version: category.version,
    items: category.items.map(item => ({ ...item })),
  };
}

function mapHistoryEntry(entry: ApiHistoryEntry): HistoryEntry {
  return {
    day: entry.date,
    free_text: entry.free_text,
    want_to_do: entry.want_to_do,
    unconscious_desire: entry.unconscious_desire,
    version: entry.version,
  };
}
