// HabitGroupCard — used on Today screen (checkable items + WOOP).
// StreakBar — 14-day record grid.

import type { HabitGroup, StreakCell } from '../types';
import { Checkbox, CountControl, Eyebrow } from './Primitives';

interface HabitGroupCardProps {
  group: HabitGroup;
  onToggle: (groupId: string, itemId: string) => void;
  onCount:  (groupId: string, itemId: string, value: number) => void;
}
export function HabitGroupCard({ group, onToggle, onCount }: HabitGroupCardProps) {
  const hasWoop = group.woop_wish || group.woop_outcome || group.woop_obstacle || group.woop_plan;
  return (
    <div className="nh-card">
      <div className="nh-card__head">{group.name}</div>
      <div className="nh-card__body">
        {group.items.length === 0 ? (
          <div style={{ padding: '12px 0', color: 'var(--fg-faint)', fontSize: 13 }}>アイテムがありません</div>
        ) : group.items.map(item => (
          <div className="kit-habit-row" key={item.id}>
            <Checkbox done={item.done} onClick={() => onToggle(group.id, item.id)} />
            <div className="kit-habit-body">
              <span className={`kit-habit-label${item.done ? ' struck' : ''}`}>{item.content}</span>
            </div>
            {item.done && (
              <CountControl value={item.count || 1} onChange={v => onCount(group.id, item.id, v)} />
            )}
          </div>
        ))}
      </div>
      {hasWoop && (
        <div className="nh-woop">
          <div className="nh-woop__title">WOOP</div>
          {group.woop_wish     && <div className="nh-woop__row"><span className="nh-woop__key">W</span><span className="nh-woop__val">{group.woop_wish}</span></div>}
          {group.woop_outcome  && <div className="nh-woop__row"><span className="nh-woop__key">O</span><span className="nh-woop__val">{group.woop_outcome}</span></div>}
          {group.woop_obstacle && <div className="nh-woop__row"><span className="nh-woop__key">O</span><span className="nh-woop__val">{group.woop_obstacle}</span></div>}
          {group.woop_plan     && <div className="nh-woop__row"><span className="nh-woop__key">P</span><span className="nh-woop__val">{group.woop_plan}</span></div>}
        </div>
      )}
    </div>
  );
}

interface StreakBarProps {
  days: StreakCell[];
}
export function StreakBar({ days }: StreakBarProps) {
  const hits = days.filter(d => d.hit).length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>記録（直近14日）</Eyebrow>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>{hits} / {days.length}日</span>
      </div>
      <div className="nh-streak-grid">
        {days.map((d, i) => (
          <div key={i} className={`nh-streak-cell${d.hit ? ' nh-streak-cell--hit' : ''}${d.today ? ' nh-streak-cell--today' : ''}`}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
