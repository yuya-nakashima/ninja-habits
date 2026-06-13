// HistoryScreen — past reflections. Click a card to expand.

import React from 'react';
import type { HistoryEntry, ScreenProps } from '../types';
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

export default function HistoryScreen({ goto, state }: ScreenProps) {
  const [openId, setOpenId] = React.useState<number | null>(null);

  return (
    <>
      <TopBar title="振り返りの記録" back onBack={() => goto('home')} />

      <div style={{ marginBottom: 16 }}>
        <StreakBar days={state.streak} />
      </div>

      {state.history.length === 0 ? (
        <EmptyState icon={<I.history width={22} height={22} />}
          title="まだ記録がありません"
          body="今夜の振り返りから、ここに静かに積み上がっていきます。" />
      ) : state.history.map((r, i) => {
        const open = openId === i;
        return (
          <div key={i} className="kit-history-card" onClick={() => setOpenId(open ? null : i)}>
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
