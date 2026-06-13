// GoalsScreen — manage daily goals + minimum-goal fallbacks.
// 本文・ミニマム目標は input の blur 時に PATCH で保存する。

import React from 'react';
import type { ScreenProps } from '../types';
import { ApiConflictError } from '../apiClient';
import { applyGoalCreated, applyGoalDeleted, applyGoalMasterUpdated } from '../application';
import { TopBar, EmptyState } from '../components/Primitives';
import { I } from '../components/Icons';

const CONFLICT_MESSAGE = '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度操作してください。';
const FAILURE_MESSAGE = '保存に失敗しました。通信環境を確認してもう一度お試しください。';

interface EditSnapshot {
  id: string;
  content: string;
  minimum_goal: string | null;
}

export default function GoalsScreen({ goto, state, setState, repo }: ScreenProps) {
  const [content, setContent] = React.useState('');
  const [minimum, setMinimum] = React.useState('');
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  // blur 時に差分保存するため、focus 時点の値を覚えておく
  const snapshot = React.useRef<EditSnapshot | null>(null);
  // 二重送信ガードは ref を真とする（同一 tick の連続発火で state closure が古い値を見るのを防ぐ）
  const pendingRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

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
      safeSetError(err instanceof ApiConflictError ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
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
      ) : state.goals.map(g => (
        <div className="kit-mgmt-row" key={g.id}>
          <span className="kit-drag"><I.grip width={16} height={16} /></span>
          <div className="kit-mgmt-body">
            <input className="kit-mgmt-min-inp" type="text"
              aria-label="目標本文"
              value={g.content}
              onFocus={() => beginEdit(g.id)}
              onBlur={() => commitEdit(g.id)}
              onChange={e => setGoalContent(g.id, e.target.value)} />
            <input className="kit-mgmt-min-inp" type="text"
              placeholder="ミニマム目標（任意）"
              value={g.minimum_goal || ''}
              onFocus={() => beginEdit(g.id)}
              onBlur={() => commitEdit(g.id)}
              onChange={e => setMin(g.id, e.target.value)} />
          </div>
          <button className="nh-iconbtn nh-iconbtn--danger" aria-label="目標を削除"
            disabled={pending.has(g.id)} onClick={() => deleteGoal(g.id)}>
            <I.x width={16} height={16} />
          </button>
        </div>
      ))}
    </>
  );
}
