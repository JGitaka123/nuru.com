/**
 * Date helpers.
 */

/**
 * Add whole months to a date, clamping the day to the target month's last
 * day. Plain `Date.setMonth(m+1)` overflows: Jan 31 → Mar 3 (skipping Feb),
 * which drifts a monthly billing anchor. addMonths(Jan 31, 1) → Feb 28/29.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
