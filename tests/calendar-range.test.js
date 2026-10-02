import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarRangeFor } from '../src/lib/calendar-months.js';

const months = (range) => range.months.map((date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
);

test('台北 2026-10-01 顯示十月至翌年一月並查詢到一月底', () => {
  const range = calendarRangeFor('2026-10-01');
  assert.deepEqual(months(range), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(range.from, '2026-10-01');
  assert.equal(range.to, '2027-01-31');
});

test('十二月月份序列可跨年', () => {
  const range = calendarRangeFor('2026-12-31');
  assert.deepEqual(months(range), ['2026-12', '2027-01', '2027-02', '2027-03']);
  assert.equal(range.to, '2027-03-31');
});

test('有效閏年與非閏年二月都保持正確月份範圍', () => {
  assert.deepEqual(months(calendarRangeFor('2024-02-29')), ['2024-02', '2024-03', '2024-04', '2024-05']);
  assert.deepEqual(months(calendarRangeFor('2025-02-28')), ['2025-02', '2025-03', '2025-04', '2025-05']);
});

test('拒絕不合法的業務日期', () => {
  assert.throws(() => calendarRangeFor('2026-13-01'), /日期/);
  assert.throws(() => calendarRangeFor('2025-02-29'), /日期/);
});
