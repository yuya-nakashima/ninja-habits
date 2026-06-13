// WishesScreen — life-wide categorized wishes.

import React from 'react';
import type { ScreenProps } from '../types';
import { createId } from '../infrastructure';
import { TopBar, EmptyState } from '../components/Primitives';
import { I } from '../components/Icons';

export default function WishesScreen({ goto, state, setState }: ScreenProps) {
  const [newCat,   setNewCat]  = React.useState('');
  const [newItems, setNewItems] = React.useState<Record<string, string>>({});

  function addCategory() {
    if (!newCat.trim()) return;
    const id = createId();
    setState(s => ({ ...s, wishes: [...s.wishes, { id, name: newCat.trim(), items: [] }] }));
    setNewCat('');
  }
  function deleteCategory(id: string) {
    setState(s => ({ ...s, wishes: s.wishes.filter(c => c.id !== id) }));
  }
  function renameCategory(id: string, name: string) {
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== id ? c : { ...c, name }),
    }));
  }
  function addItem(catId: string) {
    const v = (newItems[catId] || '').trim();
    if (!v) return;
    const id = createId();
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== catId ? c : { ...c, items: [...c.items, { id, content: v }] }),
    }));
    setNewItems(m => ({ ...m, [catId]: '' }));
  }
  function deleteItem(catId: string, itemId: string) {
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== catId ? c : { ...c, items: c.items.filter(it => it.id !== itemId) }),
    }));
  }
  function renameItem(catId: string, itemId: string, content: string) {
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== catId ? c
        : { ...c, items: c.items.map(it => it.id !== itemId ? it : { ...it, content }) }),
    }));
  }

  return (
    <>
      <TopBar title="やりたいことリスト" back onBack={() => goto('home')} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="nh-input" type="text"
          placeholder="新しいカテゴリ（例：読みたい本）"
          value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
        <button className="nh-btn nh-btn--primary" onClick={addCategory}>
          <I.plus width={18} height={18} />
        </button>
      </div>

      {state.wishes.length === 0 ? (
        <EmptyState icon={<I.heart width={22} height={22} />}
          title="カテゴリがありません"
          body="読みたい本、行きたい場所、やってみたいこと──カテゴリ別に貯めていきます。" />
      ) : state.wishes.map(cat => (
        <div className="nh-card" key={cat.id} style={{ marginBottom: 12 }}>
          <div className="nh-card__head">
            <input className="kit-group-name-inp"
              aria-label="Wishカテゴリ"
              value={cat.name}
              onChange={e => renameCategory(cat.id, e.target.value)} />
            <button className="nh-iconbtn nh-iconbtn--danger" onClick={() => deleteCategory(cat.id)}>
              <I.trash width={14} height={14} />
            </button>
          </div>
          <div className="nh-card__body">
            {cat.items.map(it => (
              <div className="kit-wish-item" key={it.id}>
                <input className="kit-additem-inp"
                  aria-label="Wish項目"
                  value={it.content}
                  onChange={e => renameItem(cat.id, it.id, e.target.value)} />
                <button className="nh-iconbtn nh-iconbtn--danger" onClick={() => deleteItem(cat.id, it.id)}>
                  <I.x width={14} height={14} />
                </button>
              </div>
            ))}
            <div className="kit-additem-row">
              <input className="kit-additem-inp" type="text"
                placeholder="やりたいことを追加"
                value={newItems[cat.id] || ''}
                onChange={e => setNewItems(m => ({ ...m, [cat.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addItem(cat.id); }} />
              <button className="nh-btn nh-btn--primary nh-btn--sm" onClick={() => addItem(cat.id)}>追加</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
