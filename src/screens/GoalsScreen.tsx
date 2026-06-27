// GoalsScreen — manage daily goals + minimum-goal fallbacks.
// 本文・ミニマム目標は input の blur 時に PATCH で保存する。
// 並び替えは @dnd-kit/sortable の drag handle で行う。

import React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ScreenProps } from '../screenTypes';
import {
  applyGoalCreated, applyGoalDeleted, applyGoalMasterUpdated, applyGoalsReordered,
  classifyRepositoryRequestFailure,
} from '../application';
import { TopBar, EmptyState } from '../components/Primitives';
import { I } from '../components/Icons';

const CONFLICT_MESSAGE = '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度操作してください。';
const FAILURE_MESSAGE = '保存に失敗しました。通信環境を確認してもう一度お試しください。';

interface EditSnapshot {
  id: string;
  content: string;
  minimum_goal: string | null;
}

interface SortableGoalRowProps {
  goal: { id: string; content: string; minimum_goal: string | null; version?: number };
  disabled: boolean;
  onFocus: (id: string) => void;
  onBlur: (id: string) => void;
  onContentChange: (id: string, val: string) => void;
  onMinChange: (id: string, val: string) => void;
  onDelete: (id: string) => void;
}

function SortableGoalRow({ goal, disabled, onFocus, onBlur, onContentChange, onMinChange, onDelete }: SortableGoalRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div className="kit-mgmt-row" ref={setNodeRef} style={style}>
      <span className="kit-drag" {...attributes} {...listeners} style={{ touchAction: 'none', cursor: 'grab' }}>
        <I.grip width={16} height={16} />
      </span>
      <div className="kit-mgmt-body">
        <input className="kit-mgmt-min-inp" type="text"
          aria-label="目標本文"
          value={goal.content}
          onFocus={() => onFocus(goal.id)}
          onBlur={() => onBlur(goal.id)}
          onChange={e => onContentChange(goal.id, e.target.value)} />
        <input className="kit-mgmt-min-inp" type="text"
          placeholder="ミニマム目標（任意）"
          value={goal.minimum_goal || ''}
          onFocus={() => onFocus(goal.id)}
          onBlur={() => onBlur(goal.id)}
          onChange={e => onMinChange(goal.id, e.target.value)} />
      </div>
      <button className="nh-iconbtn nh-iconbtn--danger" aria-label="目標を削除"
        disabled={disabled} onClick={() => onDelete(goal.id)}>
        <I.x width={16} height={16} />
      </button>
    </div>
  );
}

export default function GoalsScreen({ goto, state, setState, repo }: ScreenProps) {
  const [content, setContent] = React.useState('');
  const [minimum, setMinimum] = React.useState('');
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [reordering, setReordering] = React.useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // blur 時に差分保存するため、focus 時点の値を覚えておく
  const snapshot = React.useRef<EditSnapshot | null>(null);
  // 二重送信ガードは ref を真とする（同一 tick の連続発火で state closure が古い値を見るのを防ぐ）
  const pendingRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(true);
  // StrictMode の mount→unmount→remount で false のまま固定されないよう、本体で true に戻す
  React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  function safeSetError(message: string | null) {
    if (mountedRef.current) setError(message);
  }

  async function withRequest(pendingKey: string, request: () => Promise<void>) {
    if (pendingRef.current.has(pendingKey)) return;
    pendingRef.current.add(pendingKey);
    setPending(new Set(pendingRef.current));
    safeSetError(null);
    try {
      await request();
    } catch (err) {
      // 楽観更新を破棄してサーバー状態へ戻す（409 以外の失敗でも optimistic state を残さない）
      await repo.reloadToday().catch(() => undefined);
      safeSetError(classifyRepositoryRequestFailure(err) === 'conflict' ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
    } finally {
      pendingRef.current.delete(pendingKey);
      if (mountedRef.current) setPending(new Set(pendingRef.current));
    }
  }

  function addGoal() {
    if (!content.trim()) return;
    const payload = { content: content.trim(), minimum_goal: minimum.trim() || null };
    void withRequest('add', async () => {
      const master = await repo.createGoal(payload);
      setState(s => applyGoalCreated(s, master));
      setContent(''); setMinimum('');
    });
  }

  function deleteGoal(id: string) {
    void withRequest(id, async () => {
      await repo.deleteGoal(id);
      setState(s => applyGoalDeleted(s, id));
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || reordering) return;

    // 楽観更新: ドラッグ後の順序を即時反映
    const oldIndex = state.goals.findIndex(g => g.id === active.id);
    const newIndex = state.goals.findIndex(g => g.id === over.id);
    const reordered = arrayMove(state.goals, oldIndex, newIndex);
    setState(s => ({ ...s, goals: reordered }));

    setReordering(true);
    safeSetError(null);
    try {
      const payload = { items: reordered.map(g => ({ id: g.id, version: g.version ?? 1 })) };
      const result = await repo.reorderGoals(payload);
      setState(s => applyGoalsReordered(s, result));
    } catch (err) {
      await repo.reloadToday().catch(() => undefined);
      safeSetError(classifyRepositoryRequestFailure(err) === 'conflict' ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
    } finally {
      setReordering(false);
    }
  }

  function beginEdit(id: string) {
    const goal = state.goals.find(g => g.id === id);
    if (goal) snapshot.current = { id, content: goal.content, minimum_goal: goal.minimum_goal };
  }

  function commitEdit(id: string) {
    const goal = state.goals.find(g => g.id === id);
    const snap = snapshot.current;
    if (!goal || !snap || snap.id !== id) return;
    if (goal.content === snap.content && goal.minimum_goal === snap.minimum_goal) return;

    if (!goal.content.trim()) {
      // 本文は必須。空のまま blur したら focus 時の値へ戻す
      setState(s => ({ ...s, goals: s.goals.map(g => g.id === id ? { ...g, content: snap.content } : g) }));
      setError('目標本文は 1 文字以上で入力してください。');
      return;
    }

    void withRequest(id, async () => {
      const master = await repo.updateGoal(id, {
        content: goal.content,
        minimum_goal: goal.minimum_goal,
        version: goal.version ?? 1,
      });
      setState(s => applyGoalMasterUpdated(s, master));
    });
  }

  function setGoalContent(id: string, val: string) {
    setState(s => ({
      ...s,
      goals: s.goals.map(g => g.id === id ? { ...g, content: val } : g),
    }));
  }
  function setMin(id: string, val: string) {
    setState(s => ({
      ...s,
      goals: s.goals.map(g => g.id === id ? { ...g, minimum_goal: val.trim() || null } : g),
    }));
  }

  return (
    <>
      <TopBar title="今日の目標" back onBack={() => goto('home')} />

      {error && <div className="nh-feedback nh-feedback--danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="nh-card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="nh-field" style={{ marginBottom: 12 }}>
          <input className="nh-input" type="text"
            placeholder="今日の目標（例：瞑想を30分行う）"
            value={content} onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGoal(); }} />
          <div className="nh-field__hint">科学的な研究では、曖昧な目標よりも「具体的で少し挑戦的な目標」の方が、達成率が劇的に高まる。</div>
        </div>
        <div className="nh-field" style={{ marginBottom: 12 }}>
          <input className="nh-input" type="text"
            placeholder="ミニマム目標（任意）（例：キツい日は「1分だけ」でOK）"
            value={minimum} onChange={e => setMinimum(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGoal(); }} />
          <div className="nh-field__hint">どんなに小さくても「自分で決めた基準をクリアした」という事実が自己効力感を守る。</div>
        </div>
        <button className="nh-btn nh-btn--primary nh-btn--block"
          disabled={!content.trim() || pending.has('add')} onClick={addGoal}>
          <I.plus width={18} height={18} /> {pending.has('add') ? '追加中…' : '目標を追加'}
        </button>
      </div>

      {state.goals.length === 0 ? (
        <EmptyState icon={<I.target width={22} height={22} />}
          title="まだ目標がありません"
          body="上のフォームから今日の目標を追加してください。" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={state.goals.map(g => g.id)} strategy={verticalListSortingStrategy}>
            {state.goals.map(g => (
              <SortableGoalRow
                key={g.id}
                goal={g}
                disabled={pending.has(g.id) || reordering}
                onFocus={beginEdit}
                onBlur={commitEdit}
                onContentChange={setGoalContent}
                onMinChange={setMin}
                onDelete={deleteGoal}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
