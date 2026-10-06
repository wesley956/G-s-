import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localMonthPeriod } from '../src/lib/report.ts';
test('report defaults follow the local month across UTC midnight and year boundary', () => {
 const prior = process.env.TZ; process.env.TZ = 'America/Sao_Paulo';
 try {
  assert.deepEqual(localMonthPeriod(new Date('2026-02-01T02:59:59Z')), { start: '2026-01-01', end: '2026-01-31' });
  assert.deepEqual(localMonthPeriod(new Date('2026-01-01T02:00:00Z')), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(localMonthPeriod(new Date('2026-02-01T03:00:00Z')), { start: '2026-02-01', end: '2026-02-01' });
 } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});
