// HistoryScreen — past reflections. Click a card to expand.
// 全履歴は GET /v1/reflections（既定で直近30日）から取得する。

import React from 'react';
import type { HistoryEntry } from '../domainTypes';
import type { ScreenProps } from '../screenTypes';
import { TopBar, EmptyState } from '../components/Primitives';
import { StreakBar } from '../components/HabitGroup';
import { I } from '../components/Icons';

type ReflectionKey = 'free_text' | 'want_to_do' | 'unconscious_desire';

const LABELS: Record<ReflectionKey, string> = {
  free_text:          '今日どうだった？',
  want_to_do:         'やりたいこと（自己一致）',
  unconscious_desire: '無意識が求めること',
};

const REFLECTION_KEYS: ReflectionKey[] = ['free_text', 'want_to_do', 'unconscious_desire'];

function firstText(r: HistoryEntry): string {
  for (const k of REFLECTION_KEYS) {
    if (r[k]) return r[k]!;
  }
  return '（入力なし）';
}

export default function HistoryScreen({ goto, state, repo }: ScreenProps) {
  const [entries, setEntries] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openDay, setOpenDay] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    repo.listReflections()
      .then(rows => { if (!cancelled) setEntries(rows); })
      .catch(() => { if (!cancelled) setError('記録の取得に失敗しました。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repo]);

  return (
    <>
      <TopBar title="振り返りの記録" back onBack={() => goto('home')} />

      <div style={{ marginBottom: 16 }}>
        <StreakBar days={state.streak} />
      </div>

      {error && <div className="nh-feedback nh-feedback--danger" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="nh-muted" style={{ textAlign: 'center', padding: '24px 0' }}>読み込んでいます…</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<I.history width={22} height={22} />}
          title="まだ記録がありません"
          body="今夜の振り返りから、ここに静かに積み上がっていきます。" />
      ) : entries.map(r => {
        const open = openDay === r.day;
        return (
          <div key={r.day} className="kit-history-card" onClick={() => setOpenDay(open ? null : r.day)}>
            <div className="kit-history-date">{r.day}</div>
            {!open
              ? <div className="kit-history-preview">{firstText(r)}</div>
              : REFLECTION_KEYS.filter(k => r[k] != null).map(k => (
                  <div key={k}>
                    <div className="kit-history-field-label">{LABELS[k]}</div>
                    <div className="kit-history-field-value">{r[k]}</div>
                  </div>
                ))}
          </div>
        );
      })}
    </>
  );
}
