// HomeScreen — "Today". The nightly ritual page.

import React from 'react';
import type { GoalLogPayload, HabitItemLogPayload, ReflectionPayload } from '../apiTypes';
import type { ScreenProps } from '../screenTypes';
import { getTodayISO } from '../infrastructure';
import {
  applyGoalLogResult, applyItemLogResult, applySaveReflection, recoverRepositoryRequestFailure,
} from '../application';
import { Checkbox, CountControl, SectionHeader, TopBar, Tag, ProgressBar, EmptyState } from '../components/Primitives';
import { HabitGroupCard, StreakBar } from '../components/HabitGroup';
import { I } from '../components/Icons';

export default function HomeScreen({ goto, onLogout, state, setState, repo }: ScreenProps) {
  const todayDisplay = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo',
  }).replace(/\//g, ' / ');
  const goalsCompleted = state.goals.filter(g => g.done).length;

  const [pendingLogs, setPendingLogs] = React.useState<ReadonlySet<string>>(new Set());
  const [logError, setLogError] = React.useState<string | null>(null);

  const CONFLICT_MESSAGE = '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度操作してください。';
  const FAILURE_MESSAGE = '保存に失敗しました。通信環境を確認してもう一度お試しください。';

  async function withLogRequest(pendingKey: string, request: () => Promise<void>) {
    if (pendingLogs.has(pendingKey)) return;
    setPendingLogs(p => new Set(p).add(pendingKey));
    setLogError(null);
    try {
      await request();
    } catch (error) {
      const failure = await recoverRepositoryRequestFailure(error, repo);
      setLogError(failure === 'conflict' ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
    } finally {
      setPendingLogs(p => { const next = new Set(p); next.delete(pendingKey); return next; });
    }
  }

  function saveGoalLog(goalId: string, payload: GoalLogPayload) {
    void withLogRequest(goalId, async () => {
      const log = await repo.saveGoalLog(getTodayISO(), goalId, payload);
      setState(s => applyGoalLogResult(s, goalId, log, getTodayISO()));
    });
  }

  function saveItemLog(groupId: string, itemId: string, payload: HabitItemLogPayload) {
    void withLogRequest(itemId, async () => {
      const log = await repo.saveHabitItemLog(getTodayISO(), itemId, payload);
      setState(s => applyItemLogResult(s, groupId, itemId, log, getTodayISO()));
    });
  }

  function toggleGoal(id: string) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal) return;
    const settingDone = !goal.done;
    saveGoalLog(id, {
      done: settingDone,
      count: settingDone ? 1 : 0,
      minimum_done: settingDone ? true : goal.minimum_done,
      version: goal.log_version ?? undefined,
    });
  }

  function setGoalCount(id: string, v: number) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal || !goal.done) return;
    saveGoalLog(id, { done: true, count: v, minimum_done: goal.minimum_done, version: goal.log_version ?? undefined });
  }

  function toggleMin(id: string) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal || goal.done) return;
    saveGoalLog(id, { done: false, count: 0, minimum_done: !goal.minimum_done, version: goal.log_version ?? undefined });
  }

  function toggleItem(gId: string, iId: string) {
    const item = state.groups.find(g => g.id === gId)?.items.find(it => it.id === iId);
    if (!item) return;
    const settingDone = !item.done;
    saveItemLog(gId, iId, { done: settingDone, count: settingDone ? 1 : 0, version: item.log_version ?? undefined });
  }

  function setItemCount(gId: string, iId: string, v: number) {
    const item = state.groups.find(g => g.id === gId)?.items.find(it => it.id === iId);
    if (!item || !item.done) return;
    saveItemLog(gId, iId, { done: true, count: v, version: item.log_version ?? undefined });
  }

  const [free,  setFree]  = React.useState('');
  const [want,  setWant]  = React.useState('');
  const [uncon, setUncon] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  async function save() {
    if (saving) return;
    const today = getTodayISO();
    const payload: ReflectionPayload = {
      free_text:          free.trim()  || null,
      want_to_do:         want.trim()  || null,
      unconscious_desire: uncon.trim() || null,
      version: state.history.find(h => h.day === today)?.version,
    };
    setSaving(true);
    setSaveError(null);
    try {
      const entry = await repo.saveReflection(today, payload);
      setState(s => applySaveReflection(s, {
        free_text:          entry.free_text,
        want_to_do:         entry.want_to_do,
        unconscious_desire: entry.unconscious_desire,
        version:            entry.version,
      }, today));
      setFree(''); setWant(''); setUncon('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (error) {
      const failure = await recoverRepositoryRequestFailure(error, repo);
      setSaveError(failure === 'conflict'
        ? '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度保存してください。'
        : '保存に失敗しました。通信環境を確認してもう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar title="NINJA HABITS" right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="nh-topbar__date">{todayDisplay}</span>
          <button className="nh-iconbtn" onClick={onLogout} aria-label="ログアウト" title="ログアウト">
            <I.logout width={18} height={18} />
          </button>
        </div>
      } />

      {logError && <div className="nh-feedback nh-feedback--danger" style={{ marginBottom: 12 }}>{logError}</div>}

      {/* Today's goals */}
      <div className="home-section">
        <SectionHeader label="今日の目標" link="目標を管理 →" onLink={() => goto('goals')} />
        {state.goals.length === 0 ? (
          <EmptyState icon={<I.target width={22} height={22} />}
            title="今日の目標を追加"
            body="具体的で少し挑戦的な目標が、達成率を劇的に高めます。"
            ctaLabel="目標を追加" onCta={() => goto('goals')} />
        ) : (
          <div className="nh-card">
            <div className="nh-card__body">
              {state.goals.map(g => (
                <div className="kit-habit-row" key={g.id}>
                  <Checkbox done={g.done} onClick={() => toggleGoal(g.id)} />
                  <div className="kit-habit-body">
                    <span className={`kit-habit-label${g.done ? ' struck' : ''}`}>{g.content}</span>
                    {g.minimum_goal && (
                      <div className="kit-min-row">
                        <Checkbox small done={g.minimum_done || g.done} onClick={() => !g.done && toggleMin(g.id)} />
                        <span className="kit-min-text">ミニマム: {g.minimum_goal}</span>
                      </div>
                    )}
                  </div>
                  {g.done && <CountControl value={g.count || 1} onChange={v => setGoalCount(g.id, v)} />}
                </div>
              ))}
            </div>
          </div>
        )}
        {state.goals.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="nh-caption nh-muted">今日の進捗</span>
              <span className="nh-caption nh-muted">{goalsCompleted} / {state.goals.length}</span>
            </div>
            <ProgressBar value={goalsCompleted} max={state.goals.length} />
          </div>
        )}
      </div>

      {/* Habit stacks */}
      <div className="home-section">
        <SectionHeader label="Habit Stacking" link="グループを管理 →" onLink={() => goto('habits')} />
        {state.groups.length === 0 ? (
          <EmptyState icon={<I.list width={22} height={22} />}
            title="習慣グループがありません"
            body="習慣スタック画面からグループを追加してください。"
            ctaLabel="習慣を管理" onCta={() => goto('habits')} />
        ) : state.groups.map(g => (
          <div key={g.id} style={{ marginBottom: 12 }}>
            <HabitGroupCard group={g} onToggle={toggleItem} onCount={setItemCount} />
          </div>
        ))}
      </div>

      {/* Streak */}
      <div className="home-section">
        <StreakBar days={state.streak} />
      </div>

      {/* Reflection */}
      <div className="home-section">
        <SectionHeader label="夜の振り返り" link="過去の記録 →" onLink={() => goto('history')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ReflectionCard tag={['habit', '習慣モニタリング']} prompt="今日どうだった？"
            hint="記録すること自体が目標達成を促進する。崩れた状況も書くとヒントになる。"
            value={free} onChange={setFree}
            placeholder="例：朝の時間が取れた。夜は疲れていてスキップしてしまった。" />
          <ReflectionCard tag={['sc', 'Self-Concordance']} prompt="「やらなきゃ」、本当にやりたい？"
            hint="内発的動機と一致した目標は達成しやすく、満足度も高い。"
            value={want} onChange={setWant}
            placeholder="例：義務感より、体が軽くなる感覚に焦点を当ててみる。" />
          <ReflectionCard tag={['free', '無意識']} prompt="今、無意識が求めていることは？"
            hint="論理より先に、体や感情が欲しがっているものを言語化する。"
            value={uncon} onChange={setUncon}
            placeholder="例：静かな時間。誰にも連絡しない夜。" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="nh-btn nh-btn--secondary" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '振り返りを保存'}
          </button>
        </div>
        {saved && <div className="nh-feedback nh-feedback--success" style={{ marginTop: 10 }}>保存しました ✓</div>}
        {saveError && <div className="nh-feedback nh-feedback--danger" style={{ marginTop: 10 }}>{saveError}</div>}
      </div>

      {/* Wish list glance */}
      <div className="home-section">
        <SectionHeader label="Wish List" link="編集 →" onLink={() => goto('wishes')} />
        {state.wishes.length === 0 ? (
          <EmptyState icon={<I.heart width={22} height={22} />}
            title="やりたいことリストが空です"
            body="読みたい本や行きたい場所を記録してみましょう。" />
        ) : (
          <div className="nh-card">
            <div className="nh-card__body">
              {state.wishes.slice(0, 2).map(cat => (
                <div key={cat.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{cat.name}</div>
                  {cat.items.slice(0, 2).map(it => (
                    <div key={it.id} style={{ fontSize: 13, color: 'var(--fg-2)', padding: '3px 0' }}>{it.content}</div>
                  ))}
                  {cat.items.length > 2 && (
                    <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>+ {cat.items.length - 2} 件</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface ReflectionCardProps {
  tag: [string, string];
  prompt: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}
function ReflectionCard({ tag, prompt, hint, value, onChange, placeholder }: ReflectionCardProps) {
  const [kind, label] = tag;
  return (
    <div className="nh-card" style={{ padding: 16 }}>
      <Tag kind={kind}>{label}</Tag>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12, marginBottom: 6, lineHeight: 1.5 }}>{prompt}</div>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, marginBottom: 12 }}>{hint}</div>
      <textarea className="nh-textarea" rows={3}
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
