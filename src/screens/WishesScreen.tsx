// WishesScreen — life-wide categorized wishes.
// 追加/削除は即 API、カテゴリ名・項目本文は blur 時に差分 PATCH する。
// カテゴリ列・カテゴリ内項目列を drag-and-drop で並び替え（@dnd-kit）。

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
  applyWishCategoryCreated, applyWishCategoryDeleted, applyWishCategoryUpdated,
  applyWishCategoriesReordered, applyWishItemCreated, applyWishItemDeleted,
  applyWishItemUpdated, applyWishItemsReordered,
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

// ---------------------------------------------------------------------------
// SortableWishItem
// ---------------------------------------------------------------------------

interface WishItemRowProps {
  catId: string;
  itemId: string;
  content: string;
  pendingDelete: boolean;
  itemsReordering: boolean;
  activatorRef: (el: HTMLElement | null) => void;
  activatorProps: Record<string, unknown>;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  onDelete: () => void;
}

function WishItemRow({
  itemId, content, pendingDelete, itemsReordering,
  activatorRef, activatorProps,
  onFocus, onBlur, onChange, onDelete,
}: WishItemRowProps) {
  return (
    <div className="kit-wish-item">
      <span
        ref={activatorRef}
        {...activatorProps}
        className="kit-drag-grip"
        aria-label="ドラッグして並び替え"
        style={{ cursor: itemsReordering ? 'not-allowed' : 'grab', touchAction: 'none' }}
      >⠿</span>
      <input className="kit-additem-inp"
        aria-label="Wish項目"
        value={content}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={e => onChange(e.target.value)} />
      <button className="nh-iconbtn nh-iconbtn--danger" aria-label="項目を削除"
        disabled={pendingDelete || itemsReordering} onClick={onDelete}>
        <I.x width={14} height={14} />
      </button>
    </div>
  );
}

interface SortableWishItemProps extends Omit<WishItemRowProps, 'activatorRef' | 'activatorProps'> {}

function SortableWishItem(props: SortableWishItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.itemId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <WishItemRow
        {...props}
        activatorRef={setActivatorNodeRef as (el: HTMLElement | null) => void}
        activatorProps={{ ...attributes, ...listeners } as Record<string, unknown>}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WishCategoryCard
// ---------------------------------------------------------------------------

interface WishCategoryCardProps {
  cat: { id: string; name: string; version?: number; items: { id: string; content: string; version?: number }[] };
  newItemValue: string;
  pending: ReadonlySet<string>;
  catsReordering: boolean;
  itemsReordering: boolean;
  catActivatorRef: (el: HTMLElement | null) => void;
  catActivatorProps: Record<string, unknown>;
  snapshot: React.MutableRefObject<EditSnapshot | null>;
  onCatNameChange: (name: string) => void;
  onCatFocus: () => void;
  onCatBlur: () => void;
  onDeleteCat: () => void;
  onItemFocus: (itemId: string) => void;
  onItemBlur: (itemId: string) => void;
  onItemChange: (itemId: string, v: string) => void;
  onDeleteItem: (itemId: string) => void;
  onNewItemChange: (v: string) => void;
  onAddItem: () => void;
  onItemsDragEnd: (event: DragEndEvent) => void;
}

function WishCategoryCard({
  cat, newItemValue, pending, catsReordering, itemsReordering,
  catActivatorRef, catActivatorProps,
  onCatNameChange, onCatFocus, onCatBlur, onDeleteCat,
  onItemFocus, onItemBlur, onItemChange, onDeleteItem,
  onNewItemChange, onAddItem, onItemsDragEnd,
}: WishCategoryCardProps) {
  const itemSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  return (
    <div className="nh-card" style={{ marginBottom: 12 }}>
      <div className="nh-card__head">
        <span
          ref={catActivatorRef}
          {...catActivatorProps}
          className="kit-drag-grip"
          aria-label="カテゴリをドラッグして並び替え"
          style={{ cursor: catsReordering ? 'not-allowed' : 'grab', touchAction: 'none' }}
        >⠿</span>
        <input className="kit-group-name-inp"
          aria-label="Wishカテゴリ"
          value={cat.name}
          onFocus={onCatFocus}
          onBlur={onCatBlur}
          onChange={e => onCatNameChange(e.target.value)} />
        <button className="nh-iconbtn nh-iconbtn--danger" aria-label="カテゴリを削除"
          disabled={pending.has(cat.id) || catsReordering} onClick={onDeleteCat}>
          <I.trash width={14} height={14} />
        </button>
      </div>
      <div className="nh-card__body">
        <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={onItemsDragEnd}>
          <SortableContext items={cat.items.map(it => it.id)} strategy={verticalListSortingStrategy}>
            {cat.items.map(it => (
              <SortableWishItem
                key={it.id}
                catId={cat.id}
                itemId={it.id}
                content={it.content}
                pendingDelete={pending.has(it.id)}
                itemsReordering={itemsReordering}
                onFocus={() => onItemFocus(it.id)}
                onBlur={() => onItemBlur(it.id)}
                onChange={v => onItemChange(it.id, v)}
                onDelete={() => onDeleteItem(it.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className="kit-additem-row">
          <input className="kit-additem-inp" type="text"
            placeholder="やりたいことを追加"
            value={newItemValue}
            onChange={e => onNewItemChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddItem(); }} />
          <button className="nh-btn nh-btn--primary nh-btn--sm" onClick={onAddItem}>追加</button>
        </div>
      </div>
    </div>
  );
}

interface SortableWishCategoryCardProps extends Omit<WishCategoryCardProps, 'catActivatorRef' | 'catActivatorProps'> {}

function SortableWishCategoryCard(props: SortableWishCategoryCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.cat.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <WishCategoryCard
        {...props}
        catActivatorRef={setActivatorNodeRef as (el: HTMLElement | null) => void}
        catActivatorProps={{ ...attributes, ...listeners } as Record<string, unknown>}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WishesScreen
// ---------------------------------------------------------------------------

export default function WishesScreen({ goto, state, setState, repo }: ScreenProps) {
  const [newCat, setNewCat] = React.useState('');
  const [newItems, setNewItems] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [catsReordering, setCatsReordering] = React.useState(false);
  const [itemsReordering, setItemsReordering] = React.useState<Record<string, boolean>>({});

  const catSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const snapshot = React.useRef<EditSnapshot | null>(null);
  const pendingRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(true);
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
      setCategoryName(id, snap.value);
      safeSetError('カテゴリ名は 1 文字以上で入力してください。');
      return;
    }
    void withRequest(id, async () => {
      const master = await repo.updateWishCategory(id, { name: cat.name, version: cat.version ?? 1 });
      setState(s => applyWishCategoryUpdated(s, master));
    });
  }

  async function handleCatsDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || catsReordering) return;
    const oldIndex = state.wishes.findIndex(c => c.id === active.id);
    const newIndex = state.wishes.findIndex(c => c.id === over.id);
    const reordered = arrayMove(state.wishes, oldIndex, newIndex);
    setState(s => ({ ...s, wishes: reordered }));
    setCatsReordering(true);
    safeSetError(null);
    try {
      const payload = { items: reordered.map(c => ({ id: c.id, version: c.version ?? 1 })) };
      const result = await repo.reorderWishCategories(payload);
      setState(s => applyWishCategoriesReordered(s, result));
    } catch (err) {
      await repo.reloadToday().catch(() => undefined);
      safeSetError(classifyRepositoryRequestFailure(err) === 'conflict' ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
    } finally {
      setCatsReordering(false);
    }
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

  async function handleItemsDragEnd(catId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || itemsReordering[catId]) return;
    const cat = state.wishes.find(c => c.id === catId);
    if (!cat) return;
    const oldIndex = cat.items.findIndex(it => it.id === active.id);
    const newIndex = cat.items.findIndex(it => it.id === over.id);
    const reordered = arrayMove(cat.items, oldIndex, newIndex);
    setState(s => ({
      ...s,
      wishes: s.wishes.map(c => c.id !== catId ? c : { ...c, items: reordered }),
    }));
    setItemsReordering(r => ({ ...r, [catId]: true }));
    safeSetError(null);
    try {
      const payload = { items: reordered.map(it => ({ id: it.id, version: it.version ?? 1 })) };
      const result = await repo.reorderWishItems(catId, payload);
      setState(s => applyWishItemsReordered(s, catId, result));
    } catch (err) {
      await repo.reloadToday().catch(() => undefined);
      safeSetError(classifyRepositoryRequestFailure(err) === 'conflict' ? CONFLICT_MESSAGE : FAILURE_MESSAGE);
    } finally {
      setItemsReordering(r => ({ ...r, [catId]: false }));
    }
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
      ) : (
        <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleCatsDragEnd}>
          <SortableContext items={state.wishes.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {state.wishes.map(cat => (
              <SortableWishCategoryCard
                key={cat.id}
                cat={cat}
                newItemValue={newItems[cat.id] || ''}
                pending={pending}
                catsReordering={catsReordering}
                itemsReordering={itemsReordering[cat.id] ?? false}
                snapshot={snapshot}
                onCatNameChange={name => setCategoryName(cat.id, name)}
                onCatFocus={() => { snapshot.current = { kind: 'category', id: cat.id, value: cat.name }; }}
                onCatBlur={() => commitCategory(cat.id)}
                onDeleteCat={() => deleteCategory(cat.id)}
                onItemFocus={itemId => { snapshot.current = { kind: 'item', categoryId: cat.id, id: itemId, value: cat.items.find(it => it.id === itemId)?.content ?? '' }; }}
                onItemBlur={itemId => commitItem(cat.id, itemId)}
                onItemChange={(itemId, v) => setItemContent(cat.id, itemId, v)}
                onDeleteItem={itemId => deleteItem(cat.id, itemId)}
                onNewItemChange={v => setNewItems(m => ({ ...m, [cat.id]: v }))}
                onAddItem={() => addItem(cat.id)}
                onItemsDragEnd={ev => handleItemsDragEnd(cat.id, ev)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
