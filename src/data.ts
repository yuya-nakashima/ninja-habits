// Seed data for the interactive demo.

import type { Goal, HabitGroup, HistoryEntry, StreakCell, WishCategory } from './domainTypes';

export const DEMO_GROUPS: HabitGroup[] = [
  {
    id: '1', name: '朝の習慣',
    woop_wish:     '毎朝、目を覚ましてすぐに気持ちを整える',
    woop_outcome:  '1日が穏やかに、自分のペースで始まる',
    woop_obstacle: 'ベッドの中でスマホを見てしまう',
    woop_plan:     'もし手に取ったら、コップに水を入れに行く',
    items: [
      { id: '11', content: '水を200ml飲む',     done: true,  count: 1, notif: { on: true,  times: ['07:00'], days: [true,true,true,true,true,false,false] } },
      { id: '12', content: '5分のストレッチ',    done: false, count: 0, notif: { on: true,  times: ['07:30'], days: [true,true,true,true,true,false,false] } },
      { id: '13', content: '瞑想（呼吸を10回）', done: false, count: 0, notif: { on: false, times: ['08:00'], days: [true,true,true,true,true,false,false] } },
    ],
  },
  {
    id: '2', name: '夜のルーティン',
    woop_wish: null, woop_outcome: null, woop_obstacle: null, woop_plan: null,
    items: [
      { id: '21', content: '本を10ページ読む',    done: false, count: 0, notif: { on: true,  times: ['22:00'], days: [true,true,true,true,true,true,true] } },
      { id: '22', content: '明日の3つを書き出す', done: false, count: 0, notif: { on: false, times: ['22:30'], days: [true,true,true,true,true,false,false] } },
    ],
  },
];

export const DEMO_GOALS: Goal[] = [
  { id: '101', content: '瞑想を30分行う',            minimum_goal: 'キツい日は「1分だけ」でOK', done: false, minimum_done: false, count: 0 },
  { id: '102', content: 'ブログ記事を1つ書き始める', minimum_goal: '1段落だけ書く',            done: true,  minimum_done: true,  count: 1 },
];

export const DEMO_STREAK: StreakCell[] = (() => {
  const days = ['月','火','水','木','金','土','日'];
  const hits = [false,true,true,false,true,true,true,true,false,true,true,true,false,false];
  return hits.map((hit, i) => ({ label: days[(i + 6) % 7], hit, today: i === hits.length - 1 }));
})();

export const DEMO_WISHES: WishCategory[] = [
  { id: 'books',  name: '読みたい本',   items: [{ id: 'b1', content: 'アトミック・ハビット' }, { id: 'b2', content: '夜と霧' }, { id: 'b3', content: 'WOOP の心理学' }] },
  { id: 'places', name: '行きたい場所', items: [{ id: 'p1', content: '京都の苔寺' }, { id: 'p2', content: '島根の出雲大社' }] },
  { id: 'skills', name: 'やってみたい', items: [{ id: 's1', content: '英語で日記をつける' }] },
];

export const DEMO_HISTORY: HistoryEntry[] = [
  { day: '2026-05-20', free_text: '朝の時間が取れた。夜は疲れていてストレッチをスキップした。', want_to_do: '体が軽くなる感覚に焦点を当てる。', unconscious_desire: '静かな夜が欲しい。' },
  { day: '2026-05-19', free_text: '一日中走り回っていた。瞑想だけはどうにかこなせた。',     want_to_do: null, unconscious_desire: null },
  { day: '2026-05-18', free_text: null, want_to_do: '読書の時間を確保したい。', unconscious_desire: null },
  { day: '2026-05-17', free_text: '初めて WOOP を意識して朝のルーティンを回せた。',        want_to_do: null, unconscious_desire: '誰にも連絡しない時間。' },
];
