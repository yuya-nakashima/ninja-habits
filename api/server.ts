import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { authenticate } from './auth.js';
import { readConfig } from './config.js';
import { parseDailyLogRequest, upsertGoalLog, upsertHabitItemLog, type DailyLogKind } from './dailyLogs.js';
import { isIsoDate, todayJst } from './dates.js';
import { query } from './db.js';
import {
  createGoal, deleteGoal, listGoals, reorderGoals, updateGoal,
  parseGoalCreateRequest, parseGoalUpdateRequest, parseReorderRequest,
} from './goals.js';
import {
  createGroup, createItem, deleteGroup, deleteItem, listGroups, putNotification,
  reorderGroups, reorderItems, updateGroup, updateItem,
  parseGroupCreateRequest, parseGroupUpdateRequest, parseItemCreateRequest,
  parseItemUpdateRequest, parseNotificationRequest,
} from './habits.js';
import { parseReflectionRequest, upsertReflection } from './reflections.js';
import { buildTodayResponse, ensureUser } from './today.js';
import {
  createCategory, createItem as createWishItem, deleteCategory, deleteItem as deleteWishItem,
  listCategories, reorderCategories, reorderItems as reorderWishItems, updateCategory,
  updateItem as updateWishItem,
  parseCategoryCreateRequest, parseCategoryUpdateRequest,
  parseItemCreateRequest as parseWishItemCreateRequest, parseItemUpdateRequest as parseWishItemUpdateRequest,
} from './wishes.js';

const config = readConfig();
const MAX_BODY_BYTES = 64 * 1024;

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      await query('SELECT 1');
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    const authUser = await authenticate(req, config);
    if (!authUser) {
      sendError(res, 401, 'unauthorized', 'ログインしてください');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/me') {
      const user = await ensureUser(authUser);
      sendJson(res, 200, { id: user.id, email: user.email });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/today') {
      const date = url.searchParams.get('date');
      if (date !== null && !isIsoDate(date)) {
        sendValidationError(res, { date: 'YYYY-MM-DD で指定してください' });
        return;
      }
      sendJson(res, 200, await buildTodayResponse(authUser, date));
      return;
    }

    // -----------------------------------------------------------------------
    // 目標マスタ
    // -----------------------------------------------------------------------

    if (url.pathname === '/v1/goals') {
      if (req.method === 'GET') {
        sendJson(res, 200, { goals: await listGoals(authUser) });
        return;
      }
      if (req.method === 'POST') {
        const input = await parseBody(req, res, parseGoalCreateRequest);
        if (!input) return;
        sendJson(res, 201, await createGoal(authUser, input));
        return;
      }
    }

    if (req.method === 'PATCH' && url.pathname === '/v1/goals/reorder') {
      const input = await parseBody(req, res, parseReorderRequest);
      if (!input) return;
      const result = await reorderGoals(authUser, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, { items: result.items });
      return;
    }

    const goalPath = url.pathname.match(/^\/v1\/goals\/([^/]+)$/);
    if (goalPath && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const goalId = decodeURIComponent(goalPath[1]);
      if (req.method === 'DELETE') {
        if (await deleteGoal(authUser, goalId) === 'not_found') return sendNotFound(res);
        return sendNoContent(res);
      }
      const input = await parseBody(req, res, parseGoalUpdateRequest);
      if (!input) return;
      const result = await updateGoal(authUser, goalId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.goal);
      return;
    }

    // -----------------------------------------------------------------------
    // 習慣グループ
    // -----------------------------------------------------------------------

    if (url.pathname === '/v1/habit-groups') {
      if (req.method === 'GET') {
        sendJson(res, 200, { groups: await listGroups(authUser) });
        return;
      }
      if (req.method === 'POST') {
        const input = await parseBody(req, res, parseGroupCreateRequest);
        if (!input) return;
        sendJson(res, 201, await createGroup(authUser, input));
        return;
      }
    }

    if (req.method === 'PATCH' && url.pathname === '/v1/habit-groups/reorder') {
      const input = await parseBody(req, res, parseReorderRequest);
      if (!input) return;
      const result = await reorderGroups(authUser, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, { items: result.items });
      return;
    }

    const itemsReorderPath = url.pathname.match(/^\/v1\/habit-groups\/([^/]+)\/items\/reorder$/);
    if (itemsReorderPath && req.method === 'PATCH') {
      const input = await parseBody(req, res, parseReorderRequest);
      if (!input) return;
      const result = await reorderItems(authUser, decodeURIComponent(itemsReorderPath[1]), input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, { items: result.items });
      return;
    }

    const itemsPath = url.pathname.match(/^\/v1\/habit-groups\/([^/]+)\/items$/);
    if (itemsPath && req.method === 'POST') {
      const input = await parseBody(req, res, parseItemCreateRequest);
      if (!input) return;
      const result = await createItem(authUser, decodeURIComponent(itemsPath[1]), input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 201, result.record);
      return;
    }

    const groupPath = url.pathname.match(/^\/v1\/habit-groups\/([^/]+)$/);
    if (groupPath && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const groupId = decodeURIComponent(groupPath[1]);
      if (req.method === 'DELETE') {
        if (await deleteGroup(authUser, groupId) === 'not_found') return sendNotFound(res);
        return sendNoContent(res);
      }
      const input = await parseBody(req, res, parseGroupUpdateRequest);
      if (!input) return;
      const result = await updateGroup(authUser, groupId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.record);
      return;
    }

    // -----------------------------------------------------------------------
    // 習慣項目・通知設定
    // -----------------------------------------------------------------------

    const notificationPath = url.pathname.match(/^\/v1\/habit-items\/([^/]+)\/notification$/);
    if (notificationPath && req.method === 'PUT') {
      const input = await parseBody(req, res, parseNotificationRequest);
      if (!input) return;
      const result = await putNotification(authUser, decodeURIComponent(notificationPath[1]), input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.record);
      return;
    }

    const itemPath = url.pathname.match(/^\/v1\/habit-items\/([^/]+)$/);
    if (itemPath && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const itemId = decodeURIComponent(itemPath[1]);
      if (req.method === 'DELETE') {
        if (await deleteItem(authUser, itemId) === 'not_found') return sendNotFound(res);
        return sendNoContent(res);
      }
      const input = await parseBody(req, res, parseItemUpdateRequest);
      if (!input) return;
      const result = await updateItem(authUser, itemId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.record);
      return;
    }

    // -----------------------------------------------------------------------
    // Wish List（カテゴリ・項目）
    // -----------------------------------------------------------------------

    if (url.pathname === '/v1/wish-categories') {
      if (req.method === 'GET') {
        sendJson(res, 200, { categories: await listCategories(authUser) });
        return;
      }
      if (req.method === 'POST') {
        const input = await parseBody(req, res, parseCategoryCreateRequest);
        if (!input) return;
        sendJson(res, 201, await createCategory(authUser, input));
        return;
      }
    }

    if (req.method === 'PATCH' && url.pathname === '/v1/wish-categories/reorder') {
      const input = await parseBody(req, res, parseReorderRequest);
      if (!input) return;
      const result = await reorderCategories(authUser, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, { items: result.items });
      return;
    }

    const wishItemsReorderPath = url.pathname.match(/^\/v1\/wish-categories\/([^/]+)\/items\/reorder$/);
    if (wishItemsReorderPath && req.method === 'PATCH') {
      const input = await parseBody(req, res, parseReorderRequest);
      if (!input) return;
      const result = await reorderWishItems(authUser, decodeURIComponent(wishItemsReorderPath[1]), input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, { items: result.items });
      return;
    }

    const wishItemsPath = url.pathname.match(/^\/v1\/wish-categories\/([^/]+)\/items$/);
    if (wishItemsPath && req.method === 'POST') {
      const input = await parseBody(req, res, parseWishItemCreateRequest);
      if (!input) return;
      const result = await createWishItem(authUser, decodeURIComponent(wishItemsPath[1]), input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 201, result.record);
      return;
    }

    const wishCategoryPath = url.pathname.match(/^\/v1\/wish-categories\/([^/]+)$/);
    if (wishCategoryPath && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const categoryId = decodeURIComponent(wishCategoryPath[1]);
      if (req.method === 'DELETE') {
        if (await deleteCategory(authUser, categoryId) === 'not_found') return sendNotFound(res);
        return sendNoContent(res);
      }
      const input = await parseBody(req, res, parseCategoryUpdateRequest);
      if (!input) return;
      const result = await updateCategory(authUser, categoryId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.record);
      return;
    }

    const wishItemPath = url.pathname.match(/^\/v1\/wish-items\/([^/]+)$/);
    if (wishItemPath && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const itemId = decodeURIComponent(wishItemPath[1]);
      if (req.method === 'DELETE') {
        if (await deleteWishItem(authUser, itemId) === 'not_found') return sendNotFound(res);
        return sendNoContent(res);
      }
      const input = await parseBody(req, res, parseWishItemUpdateRequest);
      if (!input) return;
      const result = await updateWishItem(authUser, itemId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.record);
      return;
    }

    // -----------------------------------------------------------------------
    // 日次ログ・振り返り
    // -----------------------------------------------------------------------

    const dailyLogPath = url.pathname.match(/^\/v1\/daily-logs\/([^/]+)\/(goals|habit-items)\/([^/]+)$/);
    if (req.method === 'PUT' && dailyLogPath) {
      const date = decodeURIComponent(dailyLogPath[1]);
      const kind: DailyLogKind = dailyLogPath[2] === 'goals' ? 'goal' : 'habit';
      const targetId = decodeURIComponent(dailyLogPath[3]);
      const input = await parseBody(req, res, body => parseDailyLogRequest(kind, date, body, todayJst()));
      if (!input) return;
      const result = kind === 'goal'
        ? await upsertGoalLog(authUser, date, targetId, input)
        : await upsertHabitItemLog(authUser, date, targetId, input);
      if (result.kind === 'not_found') return sendNotFound(res);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.log);
      return;
    }

    const reflectionPath = url.pathname.match(/^\/v1\/reflections\/([^/]+)$/);
    if (req.method === 'PUT' && reflectionPath) {
      const date = decodeURIComponent(reflectionPath[1]);
      const input = await parseBody(req, res, body => parseReflectionRequest(date, body, todayJst()));
      if (!input) return;
      const result = await upsertReflection(authUser, date, input);
      if (result.kind === 'conflict') return sendConflict(res);
      sendJson(res, 200, result.reflection);
      return;
    }

    sendNotFound(res);
  } catch (error) {
    console.error(error);
    sendError(res, 500, 'internal_error', 'サーバーでエラーが発生しました');
  }
});

server.listen(config.port, () => {
  console.log(`ninja-habits API listening on http://127.0.0.1:${config.port}`);
});

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', config.allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,x-dev-cognito-sub,x-dev-email');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: string, message: string, fields?: Record<string, string>) {
  sendJson(res, status, { error: { code, message, ...(fields ? { fields } : {}) } });
}

function sendValidationError(res: ServerResponse, fields: Record<string, string>) {
  sendError(res, 422, 'validation_error', '入力内容を確認してください', fields);
}

function sendNotFound(res: ServerResponse) {
  sendError(res, 404, 'not_found', '見つかりません');
}

function sendConflict(res: ServerResponse) {
  sendError(res, 409, 'conflict', '他の端末で更新されています。最新の内容を取得してからやり直してください');
}

function sendNoContent(res: ServerResponse) {
  res.writeHead(204);
  res.end();
}

/** ボディを読み、parse が失敗したら 422 を返して null。成功時は入力値を返す。 */
async function parseBody<T>(
  req: IncomingMessage,
  res: ServerResponse,
  parse: (body: unknown) => { ok: true; input: T } | { ok: false; fields: Record<string, string> },
): Promise<T | null> {
  const body = await readJsonBody(req);
  if (!body.ok) {
    sendValidationError(res, { body: 'JSON を解析できません' });
    return null;
  }
  const parsed = parse(body.value);
  if (!parsed.ok) {
    sendValidationError(res, parsed.fields);
    return null;
  }
  return parsed.input;
}

async function readJsonBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return { ok: false };
    chunks.push(chunk as Buffer);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false };
  }
}
