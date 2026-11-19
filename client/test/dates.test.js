import { describe, expect, it } from 'vitest';
import { dayEnd, dayStart, formatWhen } from '../src/history/dates.js';

describe('history dates', () => {
  it('a day runs from the start of that local day to the last millisecond of it', () => {
    const start = new Date(dayStart('2026-11-19'));
    const end = new Date(dayEnd('2026-11-19'));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 19]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 10, 19]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ]);
  });

  it('gives nothing for text that is not a real date', () => {
    for (const bad of ['', undefined, null, '19/11/2026', '2026-11-31', '2026-13-01', 'x']) {
      expect(dayStart(bad)).toBe('');
      expect(dayEnd(bad)).toBe('');
    }
  });

  it('shows a time in words and leaves nonsense as it came', () => {
    expect(formatWhen('2026-11-19T12:30:00.000Z')).toMatch(/2026/);
    expect(formatWhen('not a date')).toBe('not a date');
  });
});
