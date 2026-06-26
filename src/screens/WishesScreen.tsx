// WishesScreen — life-wide categorized wishes.
// 追加/削除は即 API、カテゴリ名・項目本文は blur 時に差分 PATCH する。

import React from 'react';
import type { ScreenProps } from '../screenTypes';
import {
  applyWishCategoryCreated, applyWishCategoryDeleted, applyWishCategoryUpdated,
  applyWishItemCreated, applyWishItemDeleted, applyWishItemUpdated,
  classifyRepositoryRequestFailure,
} from '../application';
import { TopBar, EmptyState } from '../components/Primitives';
import { I } from '../components/Icons';

const CONFLICT_MESSAGE = '他の端末で更新されていたため、最新の内容を取り込みました。確認のうえ、もう一度操作してください。';
const FAILURE_MESSAGE = '保存に失敗しました。通信環境を確認してもう一度お試しください。';

// focus 時の値を覚えて blur 時に差分判定する（kind で対象を区別）
type EditSnapshot =
  | { kind: 'category'; id: string; value: string }
  | { kind: 'item'; categoryId: string; id: string; value: string };

export default function WishesScreen({ goto, state, setState, repo }: ScreenProps) {
  const [newCat, setNewCat] = React.useState('');
  const [newItems, setNewItems] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const snapshot = React.useRef<EditSnapshot | null>(null);
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

  // --- カテゴリ ---

  function addCategory() {
    if (!newCat.trim()) return;
    const name = newCat.trim();
    void withRequest('add-cat', async () => {
      const master = await repo.createWishCategory({ name });
      setState(s => applyWishCategoryCreated(s, master));
      setNewCat('');
    });
  }

  function deleteCategory(id: string) {
    void withRequest(id, async () => {
      await repo.deleteWishCategory(id);
      setState(s => applyWishCategoryDeleted(s, id));
    });
  }

  function setCategoryName(id: string, name: string) {
    setState(s => ({ ...s, wishes: s.wishes.map(c => c.id !== id ? c : { ...c, name }) }));
  }

  function commitCategory(id: string) {
    const cat = state.wishes.find(c => c.id === id);
    const snap = snapshot.current;
    if (!cat || snap?.kind !== 'category' || snap.id !== id) return;
    if (cat.name === snap.value) return;
    if (!cat.name.trim()) {
      setCategoryName(id, snap.value);   // 空のまま blur したら戻す
      safeSetError('カテゴリ名は 1 文字以上で入力してください。');
      return;
    }
    void withRequest(id, async () => {
      const master = await repo.updateWishCategory(id, { name: cat.name, version: cat.version ?? 1 });
      setState(s => applyWishCategoryUpdated(s, master));
    });
  }

  // --- 項目 ---

  function addItem(catId: string) {
    const v = (newItems[catId] || '').trim();
    if (!v) return;
    void withRequest(`add-item:${catId}`, async () => {
      const master = await repo.createWishItem(catId, { content: v });
      setState(s => applyWishItemCreated(s, master));
      setNewItems(m => ({ ...m, [catId]: '' }));
    });
  }

  function deleteItem(catId: string, itemId: string) {
    void withRequest(itemId, async () => {
      await repo.deleteWishItem(itemId);
      setState(s => applyWishItemDeleted(s, catId, itemId));
    });
  }

  function setItemContent(catId: string, itemId: string, content: string) {
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== catId ? c
        : { ...c, items: c.items.map(it => it.id !== itemId ? it : { ...it, content }) }),
    }));
  }

  function commitItem(catId: string, itemId: string) {
    const item = state.wishes.find(c => c.id === catId)?.items.find(it => it.id === itemId);
    const snap = snapshot.current;
    if (!item || snap?.kind !== 'item' || snap.id !== itemId || snap.categoryId !== catId) return;
    if (item.content === snap.value) return;
    if (!item.content.trim()) {
      setItemContent(catId, itemId, snap.value);
      safeSetError('やりたいことは 1 文字以上で入力してください。');
      return;
    }
    void withRequest(itemId, async () => {
      const master = await repo.updateWishItem(itemId, { content: item.content, version: item.version ?? 1 });
      setState(s => applyWishItemUpdated(s, catId, master));
    });
  }

  return (
    <>
      <TopBar title="やりたいことリスト" back onBack={() => goto('home')} />

      {error && <div className="nh-feedback nh-feedback--danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="nh-input" type="text"
          placeholder="新しいカテゴリ（例：読みたい本）"
          value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
        <button className="nh-btn nh-btn--primary" onClick={addCategory} disabled={pending.has('add-cat')}>
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
              onFocus={() => { snapshot.current = { kind: 'category', id: cat.id, value: cat.name }; }}
              onBlur={() => commitCategory(cat.id)}
              onChange={e => setCategoryName(cat.id, e.target.value)} />
            <button className="nh-iconbtn nh-iconbtn--danger" aria-label="カテゴリを削除"
              disabled={pending.has(cat.id)} onClick={() => deleteCategory(cat.id)}>
              <I.trash width={14} height={14} />
            </button>
          </div>
          <div className="nh-card__body">
            {cat.items.map(it => (
              <div className="kit-wish-item" key={it.id}>
                <input className="kit-additem-inp"
                  aria-label="Wish項目"
                  value={it.content}
                  onFocus={() => { snapshot.current = { kind: 'item', categoryId: cat.id, id: it.id, value: it.content }; }}
                  onBlur={() => commitItem(cat.id, it.id)}
                  onChange={e => setItemContent(cat.id, it.id, e.target.value)} />
                <button className="nh-iconbtn nh-iconbtn--danger" aria-label="項目を削除"
                  disabled={pending.has(it.id)} onClick={() => deleteItem(cat.id, it.id)}>
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
