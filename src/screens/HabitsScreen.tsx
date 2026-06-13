// HabitsScreen — manage habit-stack groups, items, WOOP, and per-item notifications.
// テキストは blur 時に PATCH、追加/削除は即 API、通知は変更ごとに項目単位で直列保存する。

import React from 'react';
import type { HabitGroup, NotifSettings, ScreenProps } from '../types';
import { getJSTNow } from '../infrastructure';
import { calcNextNotif, DOW_LABELS } from '../domain';
import { ApiConflictError } from '../apiClient';
import {
  applyGroupCreated, applyGroupDeleted, applyGroupMasterUpdated,
  applyItemCreated, applyItemDeleted, applyItemMasterUpdated, applyNotifSaved,
} from '../application';
import { Toggle, TopBar, EmptyState } from '../components/Primitives';
import { I } from '../components/Icons';

const CONFLICT_MESSAGE = '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度操作してください。';
const FAILURE_MESSAGE = '保存に失敗しました。通信環境を確認してもう一度お試しください。';

// ---------------------------------------------------------------------------
// NotifPanel — inline expansion below a habit row. 親 state を直接編集する。
// ---------------------------------------------------------------------------

interface NotifPanelProps {
  notif: NotifSettings;
  onChange: (notif: NotifSettings) => void;
}
function NotifPanel({ notif, onChange }: NotifPanelProps) {
  const { on, times, days } = notif;

  function toggleOn() {
    onChange({ ...notif, on: !on });
  }
  function updateTime(idx: number, val: string) {
    if (!val) return;
    onChange({ ...notif, times: times.map((t, i) => i === idx ? val : t) });
  }
  function removeTime(idx: number) {
    if (times.length <= 1) return;
    onChange({ ...notif, times: times.filter((_, i) => i !== idx) });
  }
  function addTime() {
    onChange({ ...notif, times: [...times, '07:00'] });
  }
  function toggleDay(idx: number) {
    onChange({ ...notif, days: days.map((d, i) => i === idx ? !d : d) });
  }

  const nextText = on ? calcNextNotif(times, days, getJSTNow()) : '—';

  return (
    <div className="notif-panel" onClick={e => e.stopPropagation()}>
      <div className="notif-panel__top">
        <span className="notif-panel__top-label">通知</span>
        <Toggle on={on} onChange={toggleOn} />
      </div>

      <div className={on ? '' : 'notif-panel__body--off'}>
        <div>
          <div className="notif-section__label">通知時間</div>
          <div className="notif-times">
            {times.map((t, idx) => (
              <div className="notif-time-row" key={idx}>
                <button className="nh-time">
                  <span className="nh-time__icon"><I.clock width={14} height={14} /></span>
                  <input type="time" value={t} onChange={e => updateTime(idx, e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none',
                      font: 'inherit', fontSize: 14, fontWeight: 500,
                      color: 'var(--fg)', fontVariantNumeric: 'tabular-nums',
                      width: 70, cursor: 'pointer' }} />
                </button>
                {times.length > 1 && (
                  <button className="nh-iconbtn nh-iconbtn--danger notif-time-row__del"
                    onClick={() => removeTime(idx)} aria-label="この時刻を削除">
                    <I.x width={14} height={14} />
                  </button>
                )}
              </div>
            ))}
            <button className="notif-time-add" onClick={addTime}>
              <I.plus width={14} height={14} /> 時刻を追加
            </button>
          </div>
        </div>

        <div>
          <div className="notif-section__label">曜日</div>
          <div className="nh-dow">
            {DOW_LABELS.map((label, idx) => (
              <button key={idx}
                className={`nh-dow__btn${days[idx] ? ' nh-dow__btn--on' : ''}`}
                onClick={() => toggleDay(idx)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="notif-next">
          <span className="notif-next__dot" />
          <span className="notif-next__label">次の通知</span>
          <span className="notif-next__time">{nextText}</span>
        </div>

        <div className="notif-footer">
          <button className="nh-btn nh-btn--ghost">
            <I.send width={13} height={13} /> テスト送信
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HabitItemRow — single item with bell toggle and expandable notification panel.
// ---------------------------------------------------------------------------

interface HabitItemRowProps {
  item: HabitGroup['items'][number];
  onRename: (content: string) => void;
  onFocusContent: () => void;
  onBlurContent: () => void;
  onDelete: () => void;
  deleting: boolean;
  onNotifChange: (notif: NotifSettings) => void;
}
function HabitItemRow({ item, onRename, onFocusContent, onBlurContent, onDelete, deleting, onNotifChange }: HabitItemRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const notifOn = item.notif.on;

  return (
    <>
      <div className={`habit-item-row${expanded ? ' is-expanded' : ''}`}>
        <span className="kit-drag"><I.grip width={14} height={14} /></span>
        <input
          className="kit-additem-inp"
          aria-label="習慣項目"
          value={item.content}
          onFocus={onFocusContent}
          onBlur={onBlurContent}
          onChange={e => onRename(e.target.value)}
          onClick={e => e.stopPropagation()} />
        <span className="habit-item-row__actions">
          <button
            className={`bell-btn${notifOn ? ' bell-btn--on' : ''}`}
            onClick={() => setExpanded(e => !e)}
            aria-label="通知設定"
            aria-expanded={expanded}>
            {notifOn ? <I.bellFilled width={18} height={18} /> : <I.bell width={18} height={18} />}
          </button>
          <button className="nh-iconbtn nh-iconbtn--danger" onClick={onDelete} disabled={deleting} aria-label="項目を削除">
            <I.x width={14} height={14} />
          </button>
        </span>
      </div>
      {expanded && (
        <NotifPanel notif={item.notif} onChange={onNotifChange} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// GroupEditor — name, items with notification controls, WOOP.
// ---------------------------------------------------------------------------

type WoopPatch = Partial<Pick<HabitGroup, 'woop_wish' | 'woop_outcome' | 'woop_obstacle' | 'woop_plan'>>;

interface GroupEditorProps {
  group: HabitGroup;
  woopOpen: boolean;
  pending: ReadonlySet<string>;
  toggleWoop: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: (content: string) => void;
  onRenameItem: (itemId: string, content: string) => void;
  onFocusItem: (itemId: string) => void;
  onBlurItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onNotifChange: (itemId: string, notif: NotifSettings) => void;
  onPatchWoop: (patch: WoopPatch) => void;
  onFocusWoop: () => void;
  onBlurWoop: () => void;
}
function GroupEditor({
  group, woopOpen, pending, toggleWoop, onRename, onDelete, onAddItem,
  onRenameItem, onFocusItem, onBlurItem, onDeleteItem, onNotifChange,
  onPatchWoop, onFocusWoop, onBlurWoop,
}: GroupEditorProps) {
  const [newItem, setNewItem] = React.useState('');
  const [name, setName] = React.useState(group.name);
  React.useEffect(() => setName(group.name), [group.name]);
  const hasWoop = group.woop_wish || group.woop_outcome || group.woop_obstacle || group.woop_plan;
  const showWoop = woopOpen || !!hasWoop;

  function commitName() {
    if (!name.trim()) {
      setName(group.name);   // 空のまま blur したら元に戻す
      return;
    }
    if (name !== group.name) onRename(name);
  }

  function addItem() {
    if (!newItem.trim()) return;
    onAddItem(newItem.trim());
    setNewItem('');
  }

  return (
    <div className="nh-card" style={{ marginBottom: 12 }}>
      <div className="nh-card__head" style={{ gap: 8 }}>
        <span className="kit-drag"><I.grip width={16} height={16} /></span>
        <input className="kit-group-name-inp"
          value={name} onChange={e => setName(e.target.value)}
          onBlur={commitName} />
        <button className="nh-iconbtn nh-iconbtn--danger" onClick={onDelete}
          disabled={pending.has(group.id)} title="グループ削除">
          <I.trash width={16} height={16} />
        </button>
      </div>

      <div className="nh-card__body">
        {group.items.map(item => (
          <HabitItemRow key={item.id} item={item}
            onRename={content => onRenameItem(item.id, content)}
            onFocusContent={() => onFocusItem(item.id)}
            onBlurContent={() => onBlurItem(item.id)}
            onDelete={() => onDeleteItem(item.id)}
            deleting={pending.has(item.id)}
            onNotifChange={notif => onNotifChange(item.id, notif)} />
        ))}
        <div className="kit-additem-row">
          <input className="kit-additem-inp" type="text"
            placeholder="習慣を追加（例：水を200ml飲む）"
            value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }} />
          <button className="nh-btn nh-btn--primary nh-btn--sm" onClick={addItem}>追加</button>
        </div>
      </div>

      <div className="nh-woop">
        <button className="kit-woop-toggle" onClick={toggleWoop}>
          {showWoop ? '▾ WOOP を編集' : '▸ WOOP を設定（任意）'}
        </button>
        {showWoop && (
          <div className="kit-woop-fields">
            <div className="nh-woop__row"><span className="nh-woop__key">W</span>
              <input className="kit-woop-inp" placeholder="Wish — 達成したいこと"
                value={group.woop_wish || ''}
                onFocus={onFocusWoop} onBlur={onBlurWoop}
                onChange={e => onPatchWoop({ woop_wish: e.target.value || null })} /></div>
            <div className="nh-woop__row"><span className="nh-woop__key">O</span>
              <input className="kit-woop-inp" placeholder="Outcome — 達成したらどんな感覚？"
                value={group.woop_outcome || ''}
                onFocus={onFocusWoop} onBlur={onBlurWoop}
                onChange={e => onPatchWoop({ woop_outcome: e.target.value || null })} /></div>
            <div className="nh-woop__row"><span className="nh-woop__key">O</span>
              <input className="kit-woop-inp" placeholder="Obstacle — 邪魔しそうな障害は？"
                value={group.woop_obstacle || ''}
                onFocus={onFocusWoop} onBlur={onBlurWoop}
                onChange={e => onPatchWoop({ woop_obstacle: e.target.value || null })} /></div>
            <div className="nh-woop__row"><span className="nh-woop__key">P</span>
              <input className="kit-woop-inp" placeholder="Plan — もし障害が起きたら？"
                value={group.woop_plan || ''}
                onFocus={onFocusWoop} onBlur={onBlurWoop}
                onChange={e => onPatchWoop({ woop_plan: e.target.value || null })} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HabitsScreen
// ---------------------------------------------------------------------------

type WoopSnapshot = { groupId: string } & Required<WoopPatch>;
type QueuedNotif = { groupId: string; notif: NotifSettings } | 'in-flight';

export default function HabitsScreen({ goto, state, setState, repo }: ScreenProps) {
  const [newGroup, setNewGroup] = React.useState('');
  const [openWoop, setOpenWoop] = React.useState<Record<string, boolean>>({});
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const itemSnapshot = React.useRef<{ itemId: string; content: string } | null>(null);
  const woopSnapshot = React.useRef<WoopSnapshot | null>(null);
  const notifQueue = React.useRef(new Map<string, QueuedNotif>());
  // 二重送信ガードは ref を真とする（同一 tick の連続発火で state closure が古い値を見るのを防ぐ）
  const pendingRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

  function safeSetError(message: string | null) {
    if (mountedRef.current) setError(message);
  }

  async function handleFailure(err: unknown) {
    // 楽観更新を破棄してサーバー状態へ戻す（409 以外の失敗でも optimistic state を残さない）。
    // これにより blur 系の未保存値が次回 snapshot に紛れ込むのも防ぐ。
    await repo.reloadToday().catch(() => undefined);
    safeSetError(err instanceof ApiConflictError ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
  }

  async function withRequest(pendingKey: string, request: () => Promise<void>) {
    if (pendingRef.current.has(pendingKey)) return;
    pendingRef.current.add(pendingKey);
    setPending(new Set(pendingRef.current));
    safeSetError(null);
    try {
      await request();
    } catch (err) {
      await handleFailure(err);
    } finally {
      pendingRef.current.delete(pendingKey);
      if (mountedRef.current) setPending(new Set(pendingRef.current));
    }
  }

  // --- グループ ---

  function addGroup() {
    if (!newGroup.trim()) return;
    const name = newGroup.trim();
    void withRequest('add-group', async () => {
      const master = await repo.createHabitGroup({ name });
      setState(s => applyGroupCreated(s, master));
      setNewGroup('');
    });
  }

  function renameGroup(id: string, name: string) {
    const group = state.groups.find(g => g.id === id);
    if (!group) return;
    void withRequest(id, async () => {
      const master = await repo.updateHabitGroup(id, { name, version: group.version ?? 1 });
      setState(s => applyGroupMasterUpdated(s, master));
    });
  }

  function deleteGroup(id: string) {
    void withRequest(id, async () => {
      await repo.deleteHabitGroup(id);
      setState(s => applyGroupDeleted(s, id));
    });
  }

  // --- WOOP（focus 時のスナップショットと比較し、blur 時に差分だけ保存） ---

  function focusWoop(groupId: string) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    woopSnapshot.current = {
      groupId,
      woop_wish: group.woop_wish,
      woop_outcome: group.woop_outcome,
      woop_obstacle: group.woop_obstacle,
      woop_plan: group.woop_plan,
    };
  }

  function commitWoop(groupId: string) {
    const group = state.groups.find(g => g.id === groupId);
    const snap = woopSnapshot.current;
    if (!group || !snap || snap.groupId !== groupId) return;

    const patch: WoopPatch = {};
    if (group.woop_wish !== snap.woop_wish) patch.woop_wish = group.woop_wish;
    if (group.woop_outcome !== snap.woop_outcome) patch.woop_outcome = group.woop_outcome;
    if (group.woop_obstacle !== snap.woop_obstacle) patch.woop_obstacle = group.woop_obstacle;
    if (group.woop_plan !== snap.woop_plan) patch.woop_plan = group.woop_plan;
    if (Object.keys(patch).length === 0) return;

    void withRequest(groupId, async () => {
      const master = await repo.updateHabitGroup(groupId, { ...patch, version: group.version ?? 1 });
      setState(s => applyGroupMasterUpdated(s, master));
    });
  }

  function patchWoop(groupId: string, patch: WoopPatch) {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id !== groupId ? g : { ...g, ...patch }),
    }));
  }

  // --- 項目 ---

  function addItem(groupId: string, content: string) {
    void withRequest(`add-item:${groupId}`, async () => {
      const master = await repo.createHabitItem(groupId, { content });
      setState(s => applyItemCreated(s, master));
    });
  }

  function renameItem(groupId: string, itemId: string, content: string) {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id !== groupId ? g
        : { ...g, items: g.items.map(it => it.id !== itemId ? it : { ...it, content }) }),
    }));
  }

  function focusItem(itemId: string) {
    const item = state.groups.flatMap(g => g.items).find(it => it.id === itemId);
    if (item) itemSnapshot.current = { itemId, content: item.content };
  }

  function commitItem(groupId: string, itemId: string) {
    const group = state.groups.find(g => g.id === groupId);
    const item = group?.items.find(it => it.id === itemId);
    const snap = itemSnapshot.current;
    if (!item || !snap || snap.itemId !== itemId) return;
    if (item.content === snap.content) return;

    if (!item.content.trim()) {
      // 本文は必須。空のまま blur したら focus 時の値へ戻す
      renameItem(groupId, itemId, snap.content);
      setError('習慣項目は 1 文字以上で入力してください。');
      return;
    }

    void withRequest(itemId, async () => {
      const master = await repo.updateHabitItem(itemId, { content: item.content, version: item.version ?? 1 });
      setState(s => applyItemMasterUpdated(s, groupId, master));
    });
  }

  function deleteItem(groupId: string, itemId: string) {
    void withRequest(itemId, async () => {
      await repo.deleteHabitItem(itemId);
      setState(s => applyItemDeleted(s, groupId, itemId));
    });
  }

  // --- 通知（変更を即 state 反映し、項目ごとに直列で PUT。連打は最後の状態に合流） ---

  function changeNotif(groupId: string, itemId: string, notif: NotifSettings) {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id !== groupId ? g
        : { ...g, items: g.items.map(it => it.id !== itemId ? it : { ...it, notif }) }),
    }));

    const queue = notifQueue.current;
    if (queue.has(itemId)) {
      queue.set(itemId, { groupId, notif });
      return;
    }
    queue.set(itemId, 'in-flight');
    void runNotifSave(groupId, itemId, notif);
  }

  async function runNotifSave(groupId: string, itemId: string, notif: NotifSettings) {
    const queue = notifQueue.current;
    let payload = notif;
    let version = state.groups.flatMap(g => g.items).find(it => it.id === itemId)?.notif.version;
    safeSetError(null);
    for (;;) {
      try {
        const saved = await repo.saveNotification(itemId, {
          on: payload.on,
          times: payload.times,
          days: payload.days,
          version: version ?? undefined,
        });
        setState(s => applyNotifSaved(s, groupId, itemId, saved));
        version = saved.version;
      } catch (err) {
        queue.delete(itemId);
        await handleFailure(err);
        return;
      }
      const next = queue.get(itemId);
      if (next && next !== 'in-flight') {
        payload = next.notif;
        queue.set(itemId, 'in-flight');
        continue;
      }
      queue.delete(itemId);
      return;
    }
  }

  return (
    <>
      <TopBar title="習慣スタック" back onBack={() => goto('home')} />

      {error && <div className="nh-feedback nh-feedback--danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="nh-input" type="text"
          placeholder="新しいグループ名（例：朝の習慣）"
          value={newGroup} onChange={e => setNewGroup(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addGroup(); }} />
        <button className="nh-btn nh-btn--primary" onClick={addGroup} disabled={pending.has('add-group')}>
          <I.plus width={18} height={18} />
        </button>
      </div>

      {state.groups.length === 0 ? (
        <EmptyState icon={<I.list width={22} height={22} />}
          title="習慣グループがありません"
          body="既存の行動をきっかけに、新しい習慣を積み上げます。" />
      ) : state.groups.map(g => (
        <GroupEditor key={g.id} group={g}
          woopOpen={!!openWoop[g.id]}
          pending={pending}
          toggleWoop={() => setOpenWoop(o => ({ ...o, [g.id]: !o[g.id] }))}
          onRename={name => renameGroup(g.id, name)}
          onDelete={() => deleteGroup(g.id)}
          onAddItem={c => addItem(g.id, c)}
          onRenameItem={(itemId, content) => renameItem(g.id, itemId, content)}
          onFocusItem={focusItem}
          onBlurItem={itemId => commitItem(g.id, itemId)}
          onDeleteItem={itemId => deleteItem(g.id, itemId)}
          onNotifChange={(itemId, notif) => changeNotif(g.id, itemId, notif)}
          onPatchWoop={patch => patchWoop(g.id, patch)}
          onFocusWoop={() => focusWoop(g.id)}
          onBlurWoop={() => commitWoop(g.id)} />
      ))}
    </>
  );
}
