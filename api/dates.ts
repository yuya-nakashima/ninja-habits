// 日付ユーティリティ。アプリ内日付は JST の YYYY-MM-DD 文字列で扱う。

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayJst(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00.000Z`);
  return new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
}

const MAX_PAST_DAYS = 30;

/** 今日から過去30日のアプリ内日付か検証する。問題なければ null、不正ならエラーメッセージを返す。 */
export function validateAppDate(date: string, today: string): string | null {
  if (!isIsoDate(date)) return 'YYYY-MM-DD で指定してください';
  if (date > today || date < addDays(today, -MAX_PAST_DAYS)) return '今日から過去30日以内の日付を指定してください';
  return null;
}
