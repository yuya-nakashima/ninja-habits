// Infrastructure — environment-dependent utilities.

import type { JSTNow } from './domainTypes';

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/** Today's date in Japan Standard Time as YYYY-MM-DD. */
export function getTodayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

/** Current time decomposed into JST components: { h, m, dow }. dow: 0=Mon … 6=Sun. */
export function getJSTNow(): JSTNow {
  const now = new Date();
  const jstStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const [datePart, timePart] = jstStr.split(' ');
  const [h, m] = timePart.split(':').map(Number);
  const dow = (new Date(datePart + 'T12:00:00+09:00').getDay() + 6) % 7;
  return { h, m, dow };
}
