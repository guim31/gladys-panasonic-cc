// -----------------------------------------------------------------------------
// The energy counter built from the daily history: it only goes up, keeps two
// months of days and folds the older ones into its base.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyEnergy,
  energyValues,
  mergeDays,
  needsPreviousMonth,
  previousMonthDate,
  restoreEnergy,
} from '../src/energy.js';

const at = (y, m, d) => new Date(y, m - 1, d, 12);

test('today and the total, from the days of the month', () => {
  const now = at(2026, 10, 3);
  const energy = mergeDays(emptyEnergy(), { 20261001: 1.1, 20261002: 2.2, 20261003: 0.4 }, now);
  assert.deepEqual(energyValues(energy, now), { today: 0.4, total: 3.7 });
  assert.equal(energy.month, '202610');
});

test('a lower value for a day never lowers the counter, a higher one raises it', () => {
  const now = at(2026, 10, 3);
  let energy = mergeDays(emptyEnergy(), { 20261002: 2 }, now);
  energy = mergeDays(energy, { 20261002: 1.5 }, now);
  assert.equal(energyValues(energy, now).total, 2);
  energy = mergeDays(energy, { 20261002: 2.25 }, now);
  assert.equal(energyValues(energy, now).total, 2.25);
});

test('days of the future are ignored, old days folded into the base', () => {
  let energy = mergeDays(emptyEnergy(), { 20260801: 5, 20260802: 1, 20261031: 9 }, at(2026, 8, 2));
  assert.equal(energyValues(energy, at(2026, 8, 2)).total, 6);
  energy = mergeDays(energy, { 20261015: 2 }, at(2026, 10, 15));
  assert.equal(energy.base, 6);
  assert.deepEqual(Object.keys(energy.days), ['20261015']);
  assert.equal(energyValues(energy, at(2026, 10, 15)).total, 8);
});

test('the previous month is read once when the month changes', () => {
  const october = mergeDays(emptyEnergy(), { 20261030: 1 }, at(2026, 10, 30));
  assert.equal(needsPreviousMonth(october, at(2026, 10, 31)), false);
  assert.equal(needsPreviousMonth(october, at(2026, 11, 1)), true);
  assert.equal(needsPreviousMonth(emptyEnergy(), at(2026, 11, 1)), false);
  const previous = previousMonthDate(at(2026, 1, 1));
  assert.deepEqual(
    [previous.getFullYear(), previous.getMonth(), previous.getDate()],
    [2025, 11, 31],
  );
});

test('a counter read back from /data is checked', () => {
  assert.deepEqual(restoreEnergy(null), emptyEnergy());
  assert.deepEqual(restoreEnergy({ base: -1 }), emptyEnergy());
  assert.deepEqual(
    restoreEnergy({ base: 2, days: { 20261001: 1, bad: 3, 20261002: -1 }, month: '202610' }),
    { base: 2, days: { 20261001: 1 }, month: '202610' },
  );
});
