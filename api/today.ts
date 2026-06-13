import type pg from 'pg';
import { todayJst } from './dates.js';
import { query } from './db.js';
import type { AuthUser } from './auth.js';

interface DbUser {
  id: string;
  email: string;
}

interface GoalRow {
  id: string;
  content: string;
  minimum_goal: string | null;
  done: boolean | null;
  minimum_done: boolean | null;
  count: number | null;
  version: number;
  log_version: number | null;
}

interface GroupRow {
  id: string;
  name: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  version: number;
}

interface ItemRow {
  id: string;
  group_id: string;
  content: string;
  done: boolean | null;
  count: number | null;
  version: number;
  log_version: number | null;
  notif_on: boolean | null;
  notif_times: string[] | null;
  notif_days: boolean[] | null;
  notif_version: number | null;
}

interface WishCategoryRow {
  id: string;
  name: string;
  version: number;
}

interface WishItemRow {
  id: string;
  category_id: string;
  content: string;
  version: number;
}

interface ReflectionRow {
  date: string;
  free_text: string | null;
  want_to_do: string | null;
  unconscious_desire: string | null;
  version: number;
}

interface StreakRow {
  log_date: string;
}

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export async function ensureUser(authUser: AuthUser): Promise<DbUser> {
  const result = await query<DbUser>(
    `
      INSERT INTO users (cognito_sub, email)
      VALUES ($1, $2)
      ON CONFLICT (cognito_sub)
      DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email
    `,
    [authUser.cognitoSub, authUser.email],
  );
  return result.rows[0];
}

export async function buildTodayResponse(authUser: AuthUser, requestedDate: string | null) {
  const user = await ensureUser(authUser);
  const date = requestedDate ?? todayJst();

  const [goals, groups, items, wishes, wishItems, history, streakHits] = await Promise.all([
    loadGoals(user.id, date),
    loadGroups(user.id),
    loadItems(user.id, date),
    loadWishCategories(user.id),
    loadWishItems(user.id),
    loadHistory(user.id),
    loadStreakHits(user.id, date),
  ]);

  return {
    date,
    goals: goals.rows.map(row => ({
      id: row.id,
      content: row.content,
      minimum_goal: row.minimum_goal,
      done: row.done === true,
      minimum_done: row.minimum_done === true,
      count: row.count ?? 0,
      version: row.version,
      log_version: row.log_version,
    })),
    groups: groups.rows.map(group => ({
      id: group.id,
      name: group.name,
      woop_wish: group.woop_wish,
      woop_outcome: group.woop_outcome,
      woop_obstacle: group.woop_obstacle,
      woop_plan: group.woop_plan,
      version: group.version,
      items: items.rows
        .filter(item => item.group_id === group.id)
        .map(item => ({
          id: item.id,
          content: item.content,
          done: item.done === true,
          count: item.count ?? 0,
          version: item.version,
          log_version: item.log_version,
          notif: {
            on: item.notif_on === true,
            times: item.notif_times ?? ['07:00'],
            days: item.notif_days ?? [true, true, true, true, true, false, false],
            // 通知行が無ければ null（クライアントは PUT で version を省略して新規作成する）
            version: item.notif_version,
          },
        })),
    })),
    streak: buildStreak(date, new Set(streakHits.rows.map(row => row.log_date))),
    wishes: wishes.rows.map(category => ({
      id: category.id,
      name: category.name,
      version: category.version,
      items: wishItems.rows
        .filter(item => item.category_id === category.id)
        .map(item => ({
          id: item.id,
          content: item.content,
          version: item.version,
        })),
    })),
    history: history.rows.map(row => ({
      date: row.date,
      free_text: row.free_text,
      want_to_do: row.want_to_do,
      unconscious_desire: row.unconscious_desire,
      version: row.version,
    })),
  };
}

function loadGoals(userId: string, date: string): Promise<pg.QueryResult<GoalRow>> {
  return query<GoalRow>(
    `
      SELECT g.id, g.content, g.minimum_goal, gl.done, gl.minimum_done, gl.count,
             g.version, gl.version AS log_version
      FROM goals g
      LEFT JOIN goal_logs gl
        ON gl.user_id = g.user_id
       AND gl.goal_id = g.id
       AND gl.log_date = $2::date
      WHERE g.user_id = $1 AND g.is_active = true
      ORDER BY g.sort_order, g.created_at
    `,
    [userId, date],
  );
}

function loadGroups(userId: string): Promise<pg.QueryResult<GroupRow>> {
  return query<GroupRow>(
    `
      SELECT id, name, woop_wish, woop_outcome, woop_obstacle, woop_plan, version
      FROM habit_groups
      WHERE user_id = $1 AND is_active = true
      ORDER BY sort_order, created_at
    `,
    [userId],
  );
}

function loadItems(userId: string, date: string): Promise<pg.QueryResult<ItemRow>> {
  return query<ItemRow>(
    `
      SELECT hi.id, hi.group_id, hi.content, hil.done, hil.count,
             hi.version, hil.version AS log_version,
             hin.enabled AS notif_on,
             hin.times AS notif_times,
             hin.days AS notif_days,
             hin.version AS notif_version
      FROM habit_items hi
      LEFT JOIN habit_item_logs hil
        ON hil.user_id = hi.user_id
       AND hil.habit_item_id = hi.id
       AND hil.log_date = $2::date
      LEFT JOIN habit_item_notifications hin
        ON hin.user_id = hi.user_id
       AND hin.habit_item_id = hi.id
      WHERE hi.user_id = $1 AND hi.is_active = true
      ORDER BY hi.group_id, hi.sort_order, hi.created_at
    `,
    [userId, date],
  );
}

function loadWishCategories(userId: string): Promise<pg.QueryResult<WishCategoryRow>> {
  return query<WishCategoryRow>(
    `
      SELECT id, name, version
      FROM wish_categories
      WHERE user_id = $1
      ORDER BY sort_order, created_at
    `,
    [userId],
  );
}

function loadWishItems(userId: string): Promise<pg.QueryResult<WishItemRow>> {
  return query<WishItemRow>(
    `
      SELECT id, category_id, content, version
      FROM wish_items
      WHERE user_id = $1
      ORDER BY category_id, sort_order, created_at
    `,
    [userId],
  );
}

function loadHistory(userId: string): Promise<pg.QueryResult<ReflectionRow>> {
  return query<ReflectionRow>(
    `
      SELECT reflection_date::text AS date, free_text, want_to_do, unconscious_desire, version
      FROM reflections
      WHERE user_id = $1
      ORDER BY reflection_date DESC
      LIMIT 7
    `,
    [userId],
  );
}

function loadStreakHits(userId: string, date: string): Promise<pg.QueryResult<StreakRow>> {
  return query<StreakRow>(
    `
      SELECT DISTINCT log_date::text
      FROM (
        SELECT log_date
        FROM goal_logs
        WHERE user_id = $1 AND log_date BETWEEN $2::date - INTERVAL '13 days' AND $2::date AND (done = true OR minimum_done = true)
        UNION ALL
        SELECT log_date
        FROM habit_item_logs
        WHERE user_id = $1 AND log_date BETWEEN $2::date - INTERVAL '13 days' AND $2::date AND done = true
        UNION ALL
        SELECT reflection_date AS log_date
        FROM reflections
        WHERE user_id = $1 AND reflection_date BETWEEN $2::date - INTERVAL '13 days' AND $2::date
      ) hits
      ORDER BY log_date
    `,
    [userId, date],
  );
}

function buildStreak(date: string, hitDates: Set<string>) {
  const base = new Date(`${date}T12:00:00+09:00`);
  return Array.from({ length: 14 }, (_, index) => {
    const offset = 13 - index;
    const day = new Date(base.getTime() - offset * 86400000);
    const iso = day.toISOString().slice(0, 10);
    return {
      label: DOW_LABELS[day.getDay()],
      hit: hitDates.has(iso),
      today: offset === 0,
    };
  });
}
