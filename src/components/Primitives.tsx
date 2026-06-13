// Shared primitive components.

import React from 'react';
import { I } from './Icons';

interface CheckboxProps {
  done: boolean;
  onClick: () => void;
  small?: boolean;
}
export function Checkbox({ done, onClick, small = false }: CheckboxProps) {
  const sz = small ? 8 : 12;
  return (
    <div
      className={`nh-chk${done ? ' nh-chk--done' : ''}${small ? ' nh-chk--sm' : ''}`}
      role="checkbox"
      aria-checked={done}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onClick(); } }}
    >
      {done && (
        <svg width={sz} height={sz} viewBox="0 0 12 12">
          <polyline points="2,6 5,9 10,3" fill="none" stroke="#0F1117" strokeWidth={small ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

interface CountControlProps {
  value: number;
  onChange: (value: number) => void;
}
export function CountControl({ value, onChange }: CountControlProps) {
  return (
    <div className="nh-count">
      <button className="nh-count__btn" onClick={() => onChange(Math.max(1, value - 1))}>−</button>
      <span className="nh-count__num">{value}</span>
      <button className="nh-count__btn" onClick={() => onChange(value + 1)}>＋</button>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="nh-eyebrow">{children}</span>;
}

interface SectionHeaderProps {
  label: string;
  link?: string;
  onLink?: () => void;
}
export function SectionHeader({ label, link, onLink }: SectionHeaderProps) {
  return (
    <div className="home-section__header">
      <Eyebrow>{label}</Eyebrow>
      {link && <button className="nh-section__link" onClick={onLink}>{link}</button>}
    </div>
  );
}

interface TopBarProps {
  title: string;
  right?: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
}
export function TopBar({ title, right, back, onBack }: TopBarProps) {
  return (
    <div className="nh-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {back && (
          <button className="nh-iconbtn" onClick={onBack} aria-label="戻る" style={{ marginLeft: -8 }}>
            <I.back width={20} height={20} />
          </button>
        )}
        <span className="nh-topbar__title">{title}</span>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

interface TagProps {
  kind: string;
  children: React.ReactNode;
}
export function Tag({ kind, children }: TagProps) {
  return <span className={`nh-tag nh-tag--${kind}`}>{children}</span>;
}

interface ProgressBarProps {
  value: number;
  max: number;
  amber?: boolean;
}
export function ProgressBar({ value, max, amber = false }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`nh-progress${amber ? ' nh-progress--amber' : ''}`}>
      <div className="nh-progress__fill" style={{ width: pct + '%' }} />
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  onChange: () => void;
}
export function Toggle({ on, onChange }: ToggleProps) {
  return (
    <div
      className={`nh-toggle${on ? ' nh-toggle--on' : ''}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onChange(); }}
    />
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}
export function EmptyState({ icon, title, body, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="nh-card">
      <div className="nh-empty">
        <div className="nh-empty__icon">{icon}</div>
        <div className="nh-empty__title">{title}</div>
        <div className="nh-empty__body">{body}</div>
        {ctaLabel && (
          <button className="nh-btn nh-btn--primary nh-btn--sm" style={{ marginTop: 4 }} onClick={onCta}>
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
